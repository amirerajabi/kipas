# Writes the KeePass test databases in ui/test/fixtures with KeePass's own library (KeePassLib inside KeePass.exe), so
# the KDBX reader is tested against files real KeePass wrote, not against our own writer. Needs KeePass 2.x installed and
# Windows PowerShell 5.1 (KeePass is a .NET Framework assembly):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/make-kdbx-fixtures.ps1
# Every database uses the password "kipas-test". Small KDF settings keep the tests fast.
$ErrorActionPreference = 'Stop'
$keepass = if ($env:KEEPASS_EXE) { $env:KEEPASS_EXE } else { 'C:\Program Files\KeePass Password Safe 2\KeePass.exe' }
[void][Reflection.Assembly]::LoadFrom($keepass)
$out = Join-Path $PSScriptRoot '..\ui\test\fixtures'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$out = (Resolve-Path $out).Path

function S([string]$v, [bool]$protect = $false) { New-Object KeePassLib.Security.ProtectedString($protect, $v) }

function New-Entry($group, [hashtable]$fields, [string[]]$tags = @()) {
  $e = New-Object KeePassLib.PwEntry($true, $true)
  foreach ($k in $fields.Keys) { $e.Strings.Set($k, (S $fields[$k] ($k -eq 'Password' -or $k -like 'PIN*'))) }
  foreach ($t in $tags) { $e.Tags.Add($t) }
  $group.AddEntry($e, $true)
  return $e
}

function Fill($db) {
  $db.Name = 'Test Vault'
  $root = $db.RootGroup
  $internet = New-Object KeePassLib.PwGroup($true, $true, 'Internet', [KeePassLib.PwIcon]::World)
  $social = New-Object KeePassLib.PwGroup($true, $true, 'Social', [KeePassLib.PwIcon]::UserCommunication)
  $bank = New-Object KeePassLib.PwGroup($true, $true, 'Banking', [KeePassLib.PwIcon]::Money)
  $root.AddGroup($internet, $true); $internet.AddGroup($social, $true); $root.AddGroup($bank, $true)

  $gh = New-Entry $internet @{ Title = 'GitHub'; UserName = 'octocat'; Password = 'old-password-1'; URL = 'https://github.com/login'; Notes = "Line one`nLine two <with> & entities" } @('work', 'code')
  $gh.CreateBackup($db)
  $gh.Strings.Set('Password', (S 'Gh!new-Pa55word' $true))
  $gh.Strings.Set('otp', (S 'otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub' $true))
  $gh.Strings.Set('Recovery code', (S 'abcd-efgh-ijkl' $true))
  $gh.Strings.Set('Plain field', (S 'not secret'))
  $gh.Binaries.Set('readme.txt', (New-Object KeePassLib.Security.ProtectedBinary($false, [Text.Encoding]::UTF8.GetBytes('attachment'))))

  # Built from code points: Windows PowerShell reads a BOM-less script as ANSI and would mangle the literal.
  $unicode = -join [char[]](0xDC, 0x6E, 0xEF, 0x63, 0xF8, 0x64, 0xE9, 0x2D, 0x3C0, 0x61, 0x73, 0x73)
  [void](New-Entry $social @{ Title = 'Mastodon'; UserName = 'me@example.com'; Password = $unicode; URL = 'mastodon.social' })
  [void](New-Entry $bank @{ Title = 'Bank'; UserName = '12345'; Password = 'b4nk'; 'PIN code' = '0000' })
  [void](New-Entry $root @{ Title = 'Root note'; Notes = 'Just a note in the root group.' })

  $db.RecycleBinEnabled = $true
  $bin = New-Object KeePassLib.PwGroup($true, $true, 'Recycle Bin', [KeePassLib.PwIcon]::TrashBin)
  $root.AddGroup($bin, $true)
  $db.RecycleBinUuid = $bin.Uuid
  [void](New-Entry $bin @{ Title = 'Deleted thing'; Password = 'gone' })
}

function Save-Db([string]$name, $kdfParams, $cipherUuid, [string]$keyFile, [uint32]$forceVersion = 0) {
  $path = Join-Path $out $name
  if (Test-Path $path) { Remove-Item $path }
  $key = New-Object KeePassLib.Keys.CompositeKey
  $key.AddUserKey((New-Object KeePassLib.Keys.KcpPassword('kipas-test')))
  if ($keyFile) { $key.AddUserKey((New-Object KeePassLib.Keys.KcpKeyFile($keyFile))) }
  $db = New-Object KeePassLib.PwDatabase
  $db.New([KeePassLib.Serialization.IOConnectionInfo]::FromPath($path), $key)
  $db.KdfParameters = $kdfParams
  $db.DataCipherUuid = $cipherUuid
  Fill $db
  # Saved through KdbxFile (not PwDatabase.Save) so the format version can be forced.
  $kdbx = New-Object KeePassLib.Serialization.KdbxFile($db)
  if ($forceVersion) { $kdbx.GetType().GetProperty('ForceVersion', [Reflection.BindingFlags]'NonPublic,Public,Instance').SetValue($kdbx, $forceVersion, $null) }
  $fs = [IO.File]::Create($path)
  try { $kdbx.Save($fs, $null, [KeePassLib.Serialization.KdbxFormat]::Default, $null) } finally { $fs.Close() }
  $db.Close()
  $bytes = [IO.File]::ReadAllBytes($path)
  "{0}: KDBX {1}.{2}, {3} bytes" -f $name, [BitConverter]::ToUInt16($bytes, 10), [BitConverter]::ToUInt16($bytes, 8), $bytes.Length
}

$aes = (New-Object KeePassLib.Cryptography.Cipher.StandardAesEngine).CipherUuid
$chacha = (New-Object KeePassLib.Cryptography.Cipher.ChaCha20Engine).CipherUuid

# KeePass 2.5x+ writes KDBX 4 by default; its internal ForceVersion gets us a KDBX 3.1 file like older KeePass wrote.
$v31 = [uint32][KeePassLib.Serialization.KdbxFile].GetField('FileVersion32_3_1', [Reflection.BindingFlags]'NonPublic,Public,Static').GetValue($null)
$aesKdf = New-Object KeePassLib.Cryptography.KeyDerivation.AesKdf
$p = $aesKdf.GetDefaultParameters(); $aesKdf.Randomize($p); $p.SetUInt64('R', 2000)
Save-Db 'kdbx3-aeskdf.kdbx' $p $aes $null $v31

$a2d = New-Object KeePassLib.Cryptography.KeyDerivation.Argon2Kdf([KeePassLib.Cryptography.KeyDerivation.Argon2Type]::D)
$p = $a2d.GetDefaultParameters(); $a2d.Randomize($p); $p.SetUInt64('M', 1048576); $p.SetUInt64('I', 2); $p.SetUInt32('P', 2)
Save-Db 'kdbx4-argon2d-chacha20.kdbx' $p $chacha $null

$keyFile = Join-Path $out 'test.keyx'
if (Test-Path $keyFile) { Remove-Item $keyFile }
[KeePassLib.Keys.KcpKeyFile]::Create($keyFile, $null)
$a2id = New-Object KeePassLib.Cryptography.KeyDerivation.Argon2Kdf([KeePassLib.Cryptography.KeyDerivation.Argon2Type]::ID)
$p = $a2id.GetDefaultParameters(); $a2id.Randomize($p); $p.SetUInt64('M', 2097152); $p.SetUInt64('I', 3); $p.SetUInt32('P', 4)
Save-Db 'kdbx4-argon2id-keyfile.kdbx' $p $aes $keyFile
