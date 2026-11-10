<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

date_default_timezone_set(APP_TIMEZONE);

// ---------- Database connection (PDO + prepared statements) ----------
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . vitacare.bd . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// ---------- JSON answer ----------
function json_out(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}


// ---------- Small validators (same rules as the JavaScript on the page) ----------

// Length in characters (works with Arabic too, even if the mbstring extension is not enabled)
function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : (int) preg_match_all('/./us', $value);
}

function clean_name(string $value): string
{
    return preg_replace('/\s+/u', ' ', trim($value)) ?? '';
}

// Returns the phone in local format (0555123456) or null when it is not a valid Algerian number
function normalize_phone(string $value): ?string
{
    $v = preg_replace('/[\s.\-()]/', '', $value) ?? '';
    if (!preg_match('/^(?:\+213|00213|0)((?:[567]\d{8})|(?:[234]\d{7}))$/', $v, $m)) {
        return null;
    }
    return '0' . $m[1];
}

function parse_date(string $value): ?DateTimeImmutable
{
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    $errors = DateTimeImmutable::getLastErrors();
    if ($d === false || ($errors && ($errors['warning_count'] || $errors['error_count']))) {
        return null;
    }
    return $d->format('Y-m-d') === $value ? $d : null;
}


// ---------- Time slots of one day, from the opening_hours table ----------
// Returns a list of "HH:MM" strings (empty when the clinic is closed that day).
function slots_for_date(PDO $pdo, DateTimeImmutable $date): array
{
    $st = $pdo->prepare('SELECT is_closed, opens_at, closes_at FROM opening_hours WHERE weekday = :w');
    $st->execute([':w' => (int) $date->format('w')]);
    $row = $st->fetch();
    if (!$row || (int) $row['is_closed'] === 1 || $row['opens_at'] === null || $row['closes_at'] === null) {
        return [];
    }

    [$oh, $om] = array_map('intval', explode(':', $row['opens_at']));
    [$ch, $cm] = array_map('intval', explode(':', $row['closes_at']));
    $start = $oh * 60 + $om;
    $end   = $ch * 60 + $cm;

    $now      = new DateTimeImmutable('now');
    $isToday  = $now->format('Y-m-d') === $date->format('Y-m-d');
    $nowLimit = (int) $now->format('G') * 60 + (int) $now->format('i') + 30; // no slot in the next 30 minutes

    $slots = [];
    for ($m = $start; $m + SLOT_MINUTES <= $end; $m += SLOT_MINUTES) {
        if ($isToday && $m <= $nowLimit) {
            continue;
        }
        $slots[] = sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
    }
    return $slots;
}

// ---------- Validation of one appointment request ----------

// Returns [cleanData, errors]. $errors is a map field => message (empty when everything is valid).
function validate_appointment(PDO $pdo, array $in): array
{
    $errors = [];
    $clean  = [];

    // Name: letters only (Latin or Arabic), at least two words
    $name = clean_name((string) ($in['name'] ?? ''));
    if ($name === '') {
        $errors['name'] = 'Please enter your full name.';
    } elseif (text_length($name) > 60) {
        $errors['name'] = 'The name is too long (60 characters maximum).';
    } elseif (!preg_match('/^[\p{L}\p{M}][\p{L}\p{M}\' ’-]*[\p{L}\p{M}]$/u', $name)) {
        $errors['name'] = 'Use letters only (no digits or symbols).';
    } elseif (count(explode(' ', $name)) < 2) {
        $errors['name'] = 'Please enter your first name and last name.';
    }
    $clean['name'] = $name;

    // Phone
    $phoneRaw = (string) ($in['phone'] ?? '');
    $phone = $phoneRaw === '' ? null : normalize_phone($phoneRaw);
    if ($phone === null) {
        $errors['phone'] = $phoneRaw === '' ? 'Please enter your phone number.' : 'Enter a valid Algerian phone number.';
    }
    $clean['phone'] = $phone;

    // Email (optional)
    $email = trim((string) ($in['email'] ?? ''));
    if ($email !== '' && (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/\.[A-Za-z]{2,}$/', $email))) {
        $errors['email'] = 'Enter a valid email address.';
    }

    $clean['email'] = $email === '' ? null : $email;

    // Specialty (must exist in the database)
    $code = (string) ($in['specialty'] ?? '');
    $st = $pdo->prepare('SELECT id, name FROM specialties WHERE code = :c');
    $st->execute([':c' => $code]);
    $spec = $st->fetch();
    if (!$spec) {
        $errors['specialty'] = 'Please choose a specialty.';
    }
    $clean['specialty_id']   = $spec ? (int) $spec['id'] : null;
    $clean['specialty_name'] = $spec ? $spec['name'] : null;

    // Date: today or later, not too far ahead, clinic open that day
    $dateStr = (string) ($in['date'] ?? '');
    $date = $dateStr === '' ? null : parse_date($dateStr);
    $slots = [];
    if ($date === null) {
        $errors['date'] = $dateStr === '' ? 'Please choose a date.' : 'This date is not valid.';
    } else {
        $today = new DateTimeImmutable('today');
        $limit = $today->modify('+' . MAX_DAYS_AHEAD . ' days');
        if ($date < $today) {
            $errors['date'] = 'Please choose today or a later date.';
        } elseif ($date > $limit) {
            $errors['date'] = 'Appointments can be booked up to ' . MAX_DAYS_AHEAD . ' days in advance.';
        } else {
            $slots = slots_for_date($pdo, $date);
            if (!$slots && $date > $today) {
                $errors['date'] = 'The clinic is closed on this day.';
            } elseif (!$slots) {
                $errors['date'] = 'No time left today or the clinic is closed. Please choose another date.';

            }
        }
    }
    $clean['date'] = $dateStr;

    // Time: must be one of the real slots of that day
    $time = (string) ($in['time'] ?? '');
    if (!isset($errors['date'])) {
        if ($time === '') {
            $errors['time'] = 'Please choose a time.';
        } elseif (!in_array($time, $slots, true)) {
            $errors['time'] = 'This time is not available. Please choose another one.';
        }
    }
    $clean['time'] = $time;

    // Reason (optional)
    $message = trim((string) ($in['message'] ?? ''));
    if (text_length($message) > 500) {
        $errors['message'] = 'The text is too long (500 characters maximum).';
    } elseif (preg_match('/<[^>]*>/', $message)) {
        $errors['message'] = 'Please do not use HTML tags.';
    }
    $clean['message'] = $message === '' ? null : $message;

    return [$clean, $errors];
}