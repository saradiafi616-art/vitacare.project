<?php
// Never print PHP warnings into the response: they would break the JSON
ini_set('display_errors', '0');
error_reporting(E_ALL);
ob_start();

header('Content-Type: application/json; charset=utf-8');

function respond(array $data, int $status = 200): void {
    ob_end_clean();                 // drop anything printed by accident
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['ok' => false, 'error' => 'Invalid request.'], 405);
}

$name      = trim($_POST['name'] ?? '');
$phone     = trim($_POST['phone'] ?? '');
$email     = trim($_POST['email'] ?? '');
$specialty = trim($_POST['specialty'] ?? '');
$date      = trim($_POST['date'] ?? '');
$time      = trim($_POST['time'] ?? '');
$message   = trim($_POST['message'] ?? '');

// Server-side checks (never trust the browser only)
if ($name === '' || $phone === '' || $specialty === '' || $date === '' || $time === '') {
    respond(['ok' => false, 'error' => 'Please fill in all required fields.']);
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {

    respond(['ok' => false, 'error' => 'Invalid email address.']);
}
if (mb_strlen($message) > 500) {
    respond(['ok' => false, 'error' => 'The message is too long.']);
}

// Optional PDF upload
$savedFile = '';
if (isset($_FILES['medicalFile']) && $_FILES['medicalFile']['error'] !== UPLOAD_ERR_NO_FILE) {
    $file = $_FILES['medicalFile'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        respond(['ok' => false, 'error' => 'The file could not be uploaded.']);
    }
    if ($file['size'] > 5 * 1024 * 1024) {
        respond(['ok' => false, 'error' => 'File size must not exceed 5 MB.']);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    if ($finfo->file($file['tmp_name']) !== 'application/pdf') {
        respond(['ok' => false, 'error' => 'Please upload a PDF file only.']);
    }

    $dir = __DIR__ . '/uploads';
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        respond(['ok' => false, 'error' => 'Could not create the uploads folder.'], 500);
    }
    $savedFile = bin2hex(random_bytes(8)) . '.pdf';
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $savedFile)) {
        respond(['ok' => false, 'error' => 'Could not save the uploaded file.'], 500);
    }
}


$reference = 'VC-' . date('Ymd') . '-' . random_int(1000, 9999);

// TODO (MySQL): insert $reference, $name, $phone, $email, $specialty,
// $date, $time, $message, $savedFile with a prepared statement (PDO).

respond(['ok' => true, 'reference' => $reference]);