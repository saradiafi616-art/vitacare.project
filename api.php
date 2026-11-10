<?php
header("Content-Type: application/json; charset=utf-8");
require __DIR__ . "/db.php";

if (!$pdo) {
    http_response_code(500);
    echo json_encode(["ok" => false]);
    exit;
}

try {
    $specialties = $pdo->query(
        "SELECT slug, name, description, icon FROM specialties WHERE active = 1 ORDER BY sort_order, name"
    )->fetchAll();

    $doctors = $pdo->query(
        "SELECT d.full_name, d.photo, d.bio, s.name AS specialty
         FROM doctors d
         LEFT JOIN specialties s ON s.slug = d.specialty_slug
         WHERE d.active = 1 ORDER BY d.id"
    )->fetchAll();

    $settings = $pdo->query("SELECT setting_key, setting_value FROM settings")
                    ->fetchAll(PDO::FETCH_KEY_PAIR);

    echo json_encode([
        "ok"          => true,
        "specialties" => $specialties,
        "doctors"     => $doctors,
        "settings"    => $settings
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["ok" => false]);
}