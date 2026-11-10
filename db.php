<?php
$host = "localhost";
$db   = "vitacare";
$user = "root";   // غيّره إذا كان عندك مستخدم آخر
$pass = "";       // كلمة سر MySQL

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode(["ok" => false, "error" => "Database connection failed."]);
    exit;
}