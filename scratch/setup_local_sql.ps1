# 1. Encontrar la clave de la instancia MSSQLSERVER en el registro
$instances = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL*"
Write-Host "Instancias encontradas: $($instances.Name)"

foreach ($inst in $instances) {
    $tcpPath = "$($inst.PSPath)\MSSQLServer\SuperSocketNetLib\Tcp"
    $ipAllPath = "$tcpPath\IPAll"
    $serverPath = "$($inst.PSPath)\MSSQLServer"

    if (Test-Path $tcpPath) {
        Write-Host "Habilitando TCP en $tcpPath..."
        Set-ItemProperty -Path $tcpPath -Name "Enabled" -Value 1
        Set-ItemProperty -Path $tcpPath -Name "ListenOnAllIPs" -Value 1

        Write-Host "Configurando puerto 1433 en $ipAllPath..."
        Set-ItemProperty -Path $ipAllPath -Name "TcpPort" -Value "1433"
        Set-ItemProperty -Path $ipAllPath -Name "TcpDynamicPorts" -Value ""
    }

    if (Test-Path $serverPath) {
        # LoginMode: 2 = Mixed Mode (SQL Server and Windows Authentication)
        Write-Host "Verificando autenticacion mixta (LoginMode = 2) en $serverPath..."
        Set-ItemProperty -Path $serverPath -Name "LoginMode" -Value 2
    }
}

Write-Host "Reiniciando servicio MSSQLSERVER..."
Restart-Service -Name MSSQLSERVER -Force
Write-Host "Servicio MSSQLSERVER reiniciado."

Start-Sleep -Seconds 3

# Verificar si el puerto 1433 ahora esta a la escucha
$test = Test-NetConnection -ComputerName 127.0.0.1 -Port 1433
Write-Host "Prueba de puerto 1433 en 127.0.0.1: $($test.TcpTestSucceeded)"
