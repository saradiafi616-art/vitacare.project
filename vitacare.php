
<?php

$host = "localhost";
$dbname = "vitacare";
$username = "root";
$password = "";

try {

    $conn = new PDO(
        "mysql:host=$host;vitacare=$vitacare.project;charset=utf8mb4",
        $username,
        $password
    );

    $conn->setAttribute(
        PDO::ATTR_ERRMODE,
        PDO::ERRMODE_EXCEPTION
    );

} catch (PDOException $e) {

    die("Database connection failed.");

}

?>
