Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL*\MSSQLServer\SuperSocketNetLib\Tcp" | Select-Object PSChildName, Enabled, ListenOnAllIPs
