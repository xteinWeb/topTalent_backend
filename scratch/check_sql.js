const { execSync } = require('child_process');

try {
  const script = `
    $wmi16 = Get-CimInstance -Namespace 'root/Microsoft/SqlServer/ComputerManagement16' -ClassName ServerNetworkProtocolProperty -ErrorAction SilentlyContinue
    if (-not $wmi16) {
      $wmi16 = Get-CimInstance -Namespace 'root/Microsoft/SqlServer/ComputerManagement15' -ClassName ServerNetworkProtocolProperty -ErrorAction SilentlyContinue
    }
    if (-not $wmi16) {
      $wmi16 = Get-CimInstance -Namespace 'root/Microsoft/SqlServer/ComputerManagement14' -ClassName ServerNetworkProtocolProperty -ErrorAction SilentlyContinue
    }
    $wmi16 | Where-Object { $_.ProtocolName -eq 'Tcp' } | Select-Object InstanceName, PropertyName, PropertyStrValue, PropertyNumValue | Format-Table -AutoSize
  `;
  const res = execSync(`powershell -Command "${script.replace(/\r?\n/g, ' ')}"`, { encoding: 'utf-8' });
  console.log(res);
} catch (e) {
  console.error(e.message);
}
