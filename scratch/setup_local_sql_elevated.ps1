$logFile = "$PSScriptRoot\sql_setup_log.txt"
"--- Iniciando configuración de SQL Server (Elevado) ---" | Out-File -FilePath $logFile -Encoding utf8

try {
    # 1. Habilitar TCP/IP en MSSQL16.MSSQLSERVER
    $tcpPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQLServer\SuperSocketNetLib\Tcp"
    $ipAllPath = "$tcpPath\IPAll"
    $serverPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQLServer"

    Set-ItemProperty -Path $tcpPath -Name "Enabled" -Value 1
    Set-ItemProperty -Path $tcpPath -Name "ListenOnAllIPs" -Value 1
    Set-ItemProperty -Path $ipAllPath -Name "TcpPort" -Value "1433"
    Set-ItemProperty -Path $ipAllPath -Name "TcpDynamicPorts" -Value ""
    Set-ItemProperty -Path $serverPath -Name "LoginMode" -Value 2

    "Configuración de registro TCP y Modo Mixto completada." | Out-File -FilePath $logFile -Append -Encoding utf8

    # 2. Reiniciar el servicio
    Restart-Service -Name MSSQLSERVER -Force
    "Servicio MSSQLSERVER reiniciado exitosamente." | Out-File -FilePath $logFile -Append -Encoding utf8

    Start-Sleep -Seconds 3

    # 3. Crear base de datos TOP_TALENT y configurar usuario sa
    $sqlCmds = @"
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = 'TOP_TALENT')
BEGIN
    CREATE DATABASE TOP_TALENT;
END

ALTER LOGIN sa WITH PASSWORD = 'sql2025SEadmin', CHECK_POLICY = OFF;
ALTER LOGIN sa ENABLE;
"@

    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=.;Database=master;Integrated Security=True;")
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sqlCmds
    $cmd.ExecuteNonQuery()
    $conn.Close()

    "Base de datos TOP_TALENT creada/verificada y usuario sa configurado." | Out-File -FilePath $logFile -Append -Encoding utf8

} catch {
    "ERROR: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
}
