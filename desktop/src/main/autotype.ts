// Auto-type on Windows: type an entry's values into the window that comes to the front once Kipas steps aside.
//
// Windows PowerShell (always installed) loads a small C# helper that calls SendInput. Characters go in as Unicode
// (KEYEVENTF_UNICODE), so a Persian or German keyboard layout does not change what is typed; TAB, ENTER and the other
// keys go in as virtual keys. Secrets travel to the helper on stdin, never on its command line. Before typing, the
// helper waits for the user to let go of Ctrl/Shift/Alt (or "a" would become Ctrl+A) and for another app's window to be
// in front; if the front window changes while typing, it stops, so a password is never typed into the wrong app.
// The helper is compiled once per version into userData/autotype/ (PowerShell's Add-Type), then just loaded.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import type { AutoTypeKey, AutoTypeResult, AutoTypeStep } from '../../../shared/protocol';

const VK: Record<AutoTypeKey, number> = {
  tab: 0x09,
  enter: 0x0d,
  space: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  esc: 0x1b,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  home: 0x24,
  end: 0x23,
};

const MAX_STEPS = 400;
const MAX_TEXT = 16_384;
const TIMEOUT_MS = 30_000;

const HELPER_CS = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class KipasAutoType {
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public MOUSEINPUT mi; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  const uint KEYUP = 2, UNICODE = 4;
  public static IntPtr Foreground() { return GetForegroundWindow(); }
  public static int PidOf(IntPtr hwnd) { if (hwnd == IntPtr.Zero) return 0; uint pid; GetWindowThreadProcessId(hwnd, out pid); return (int)pid; }
  public static bool ModifiersDown() {
    foreach (int vk in new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }) if ((GetAsyncKeyState(vk) & 0x8000) != 0) return true;
    return false;
  }
  static void Send(INPUT[] a) { SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); }
  public static void Key(ushort vk) {
    INPUT[] a = new INPUT[2];
    a[0].type = 1; a[0].u.ki.wVk = vk;
    a[1].type = 1; a[1].u.ki.wVk = vk; a[1].u.ki.dwFlags = KEYUP;
    Send(a); Thread.Sleep(15);
  }
  public static void Text(string s) {
    foreach (char c in s) {
      INPUT[] a = new INPUT[2];
      a[0].type = 1; a[0].u.ki.wScan = c; a[0].u.ki.dwFlags = UNICODE;
      a[1].type = 1; a[1].u.ki.wScan = c; a[1].u.ki.dwFlags = UNICODE | KEYUP;
      Send(a); Thread.Sleep(4);
    }
  }
}
`;

// The PowerShell side: load (or build once) the helper, read the job from stdin, wait for a target, type, report.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$dll = $env:KIPAS_AUTOTYPE_DLL
if (-not (Test-Path -LiteralPath $dll)) { Add-Type -TypeDefinition $env:KIPAS_AUTOTYPE_CS -OutputAssembly $dll }
Add-Type -LiteralPath $dll
$job = [Console]::In.ReadToEnd() | ConvertFrom-Json
$until = (Get-Date).AddSeconds(3)
while ([KipasAutoType]::ModifiersDown() -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 20 }
$until = (Get-Date).AddSeconds(2)
do {
  $hwnd = [KipasAutoType]::Foreground()
  $pid2 = [KipasAutoType]::PidOf($hwnd)
  $ok = $pid2 -ne 0 -and $pid2 -ne [int]$job.self -and ($job.target -eq 0 -or $pid2 -eq [int]$job.target)
  if (-not $ok) { Start-Sleep -Milliseconds 30 }
} while (-not $ok -and (Get-Date) -lt $until)
if (-not $ok) { [Console]::Out.Write('no-target'); exit 0 }
Start-Sleep -Milliseconds 100
foreach ($s in $job.steps) {
  if ([KipasAutoType]::Foreground() -ne $hwnd) { [Console]::Out.Write('focus-lost'); exit 0 }
  switch ($s.t) {
    'text' { [KipasAutoType]::Text([string]$s.v) }
    'key' { [KipasAutoType]::Key([uint16]$s.v) }
    'delay' { Start-Sleep -Milliseconds ([int]$s.v) }
  }
}
[Console]::Out.Write('ok')
`;

/** Validate what the renderer sent: known step kinds and keys, bounded size. Throws on anything else. */
export function checkSteps(raw: unknown): AutoTypeStep[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_STEPS) throw new Error('Bad auto-type steps.');
  let chars = 0;
  return raw.map((s: unknown): AutoTypeStep => {
    const x = s as { t?: unknown; v?: unknown };
    if (x?.t === 'text' && typeof x.v === 'string') {
      chars += x.v.length;
      if (chars > MAX_TEXT) throw new Error('Auto-type text is too long.');
      return { t: 'text', v: x.v };
    }
    if (x?.t === 'key' && typeof x.v === 'string' && x.v in VK) return { t: 'key', v: x.v as AutoTypeKey };
    if (x?.t === 'delay' && typeof x.v === 'number' && x.v >= 0 && x.v <= 10_000) return { t: 'delay', v: Math.round(x.v) };
    throw new Error('Bad auto-type step.');
  });
}

export interface AutoTypeOptions {
  /** Where the compiled helper is kept. */
  cacheDir: string;
  /** Our own process: its windows are never typed into. */
  selfPid: number;
  /** Tests: type only into this process's window (0 = any other app). */
  targetPid?: number;
}

export function runAutoType(steps: AutoTypeStep[], o: AutoTypeOptions): Promise<AutoTypeResult> {
  if (process.platform !== 'win32') return Promise.resolve('unsupported');
  mkdirSync(o.cacheDir, { recursive: true });
  const dll = path.join(o.cacheDir, `KipasAutoType-${createHash('sha256').update(HELPER_CS).digest('hex').slice(0, 12)}.dll`);
  const ps = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const job = JSON.stringify({ self: o.selfPid, target: o.targetPid ?? 0, steps: steps.map((s) => (s.t === 'key' ? { t: 'key', v: VK[s.v] } : s)) });
  return new Promise((resolve) => {
    const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')], {
      env: { ...process.env, KIPAS_AUTOTYPE_DLL: dll, KIPAS_AUTOTYPE_CS: HELPER_CS },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', () => {
      clearTimeout(timer);
      resolve('failed');
    });
    child.on('close', () => {
      clearTimeout(timer);
      const r = out.trim();
      if (r === 'ok' || r === 'no-target' || r === 'focus-lost') resolve(r);
      else {
        // Never log stdin or the job: it holds the password. stderr is PowerShell's own message.
        console.error(`auto-type helper failed: ${err.split('\n')[0].slice(0, 300)}`);
        resolve('failed');
      }
    });
    child.stdin.end(job);
  });
}
