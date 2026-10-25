# The target for scripts/test-autotype.mts: a small window with a user name box and a password box. It prints its PID,
# tries to come to the front, and after a few seconds prints what was typed into the boxes, then closes itself.
# Run only through test-autotype.mts, which types into this window and nowhere else.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Kipas auto-type test'
$form.Width = 420; $form.Height = 180; $form.TopMost = $true; $form.StartPosition = 'CenterScreen'
$user = New-Object System.Windows.Forms.TextBox; $user.Left = 20; $user.Top = 20; $user.Width = 360
$pass = New-Object System.Windows.Forms.TextBox; $pass.Left = 20; $pass.Top = 60; $pass.Width = 360
$form.Controls.Add($user); $form.Controls.Add($pass)
$timer = New-Object System.Windows.Forms.Timer; $timer.Interval = [int]$args[0]
$timer.Add_Tick({ $timer.Stop(); [Console]::Out.WriteLine('RESULT ' + (@{ user = $user.Text; pass = $pass.Text } | ConvertTo-Json -Compress)); $form.Close() })
$form.Add_Shown({
  [Microsoft.VisualBasic.Interaction]::AppActivate($PID)
  $form.Activate(); $user.Focus()
  [Console]::Out.WriteLine("READY $PID")
  $timer.Start()
})
[System.Windows.Forms.Application]::Run($form)
