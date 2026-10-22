try {
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=.;Database=master;Integrated Security=True;")
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT name FROM sys.databases"
    $reader = $cmd.ExecuteReader()
    Write-Host "Bases de datos en SQL Server Local (.):"
    while ($reader.Read()) {
        Write-Host " - " $reader["name"]
    }
    $conn.Close()
} catch {
    Write-Host "Error conectando con autenticacion de Windows: " $_.Exception.Message
}
