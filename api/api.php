<?php
// api/api.php
declare(strict_types=1);

ini_set('display_errors', 1);
error_reporting(E_ALL);

// Log direct naar env/logs/php_errors.log
ini_set('log_errors', '1');
ini_set('error_log', dirname(__DIR__) . '/env/logs/php_errors.log');

header('Content-Type: application/json; charset=utf-8');

// No-cache headers om iOS standalone caching te voorkomen
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

session_start();

// Config en database uit env/
require_once dirname(__DIR__) . '/env/config.php';
require_once dirname(__DIR__) . '/env/db.php';

// === Helpers ===
function respond($data)
{
    echo json_encode($data);
    exit;
}

function require_login()
{
    if (!isset($_SESSION['user_id'])) {
        respond(['error' => 'Niet ingelogd']);
    }
}

function uploads_dir(): string
{
    return dirname(__DIR__) . '/env/uploads/';
}

function uploads_url(string $filename): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'];
    $basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/'); // meestal /api
    return $scheme . "://" . $host . $basePath . "/../env/uploads/" . ltrim($filename, '/');
}

// Lees POST JSON body
$input = json_decode(file_get_contents('php://input'), true) ?? [];

$action = null;
if (!empty($_POST['action'])) {
    $action = $_POST['action'];
} elseif (!empty($input['action'])) {
    $action = $input['action'];
} elseif (!empty($_GET['action'])) {
    $action = $_GET['action'];
}

try {
    $db = db();

    // LOGIN
    if ($action === 'login') {
        $email = trim($input['email'] ?? '');
        $password = $input['password'] ?? '';
        if (!$email || !$password)
            respond(['error' => 'E-mail en wachtwoord vereist']);

        $stmt = $db->prepare('SELECT id, name, email, password_hash, is_admin FROM users WHERE email = ? AND active = 1');
        $stmt->bind_param('s', $email);
        $stmt->execute();
        $res = $stmt->get_result();
        $user = $res->fetch_assoc();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            respond(['error' => 'Ongeldige inlog']);
        }
        $_SESSION['user_id'] = (int) $user['id'];
        respond([
            'ok' => true,
            'user' => [
                'id' => (int) $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'is_admin' => (int) $user['is_admin']
            ]
        ]);
    }

    // CURRENT USER
    if ($action === 'me') {
        if (!isset($_SESSION['user_id']))
            respond(['user' => null]);
        $uid = (int) $_SESSION['user_id'];
        $stmt = $db->prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?');
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $res = $stmt->get_result();
        $user = $res->fetch_assoc();
        $user['id'] = (int) $user['id'];
        $user['is_admin'] = (int) $user['is_admin'];
        respond(['user' => $user]);
    }

    // LOGOUT
    if ($action === 'logout') {
        session_destroy();
        respond(['ok' => true]);
    }

    // LIST USERS
    if ($action === 'list_users') {
        require_login();
        $res = $db->query('SELECT id, name, iban, qr_url FROM users WHERE active = 1 AND is_admin = 0 ORDER BY name');
        $users = [];
        while ($row = $res->fetch_assoc()) {
            $users[] = [
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'iban' => $row['iban'],
                'qr_url' => $row['qr_url']
            ];
        }
        respond(['users' => $users]);
    }

    // LIST MAPPINGS
    if ($action === 'list_mappings') {
        require_login();

        $res = $db->query('
        SELECT o.id AS owner_id, o.name AS owner_name,
               u.id AS qr_user_id, u.name AS qr_user_name, u.qr_url
        FROM qr_config q
        JOIN users o ON o.id = q.owner_user_id
        LEFT JOIN users u ON u.id = q.qr_user_id
        ORDER BY o.name
    ');

        $mappings = [];
        while ($row = $res->fetch_assoc()) {
            $mappings[] = [
                'owner_id' => (int) $row['owner_id'],
                'owner_name' => $row['owner_name'],
                'qr_user_id' => $row['qr_user_id'] ? (int) $row['qr_user_id'] : null,
                'qr_user_name' => $row['qr_user_name'] ?? '',
                'qr_url' => $row['qr_url'] ?? ''
            ];
        }

        respond(['mappings' => $mappings]);
    }

    // VERWIJDER MAPPING
    if ($action === 'delete_mapping') {
    require_login();

    $owner_user_id = intval($input['owner_user_id'] ?? 0);
    if (!$owner_user_id) {
        respond(['error' => 'Ongeldig owner ID']);
    }

    $stmt = $db->prepare('DELETE FROM qr_config WHERE owner_user_id = ?');
    $stmt->bind_param('i', $owner_user_id);
    $stmt->execute();

    respond(['success' => true]);
}

    // UPDATE MAPPING
    if ($action === 'update_mapping') {
        require_login();

        $owner_user_id = intval($input['owner_user_id'] ?? 0);
        $qr_user_id = intval($input['qr_user_id'] ?? 0);

        if (!$owner_user_id || !$qr_user_id) {
            respond(['error' => 'Ongeldige invoer']);
        }

        // Upsert in qr_config
        $stmt = $db->prepare('
INSERT INTO qr_config (owner_user_id, qr_user_id)
VALUES (?, ?)
ON DUPLICATE KEY UPDATE qr_user_id=VALUES(qr_user_id)
');
        $stmt->bind_param('ii', $owner_user_id, $qr_user_id);
        $stmt->execute();

        respond(['success' => true]);
    }

    // ADD SALE
    if ($action === 'add_sale') {
        require_login();

        $description = trim($input['description'] ?? '');
        $price = $input['price'] ?? null;
        $cost = $input['cost'] ?? null;
        $owner_user_id = $input['owner_user_id'] ?? null;

        if (!$description || !is_numeric($price) || !$owner_user_id) {
            respond(['error' => 'Ongeldige invoer']);
        }

        $price = floatval($price);
        $owner_user_id = intval($owner_user_id);
        $cashier_user_id = intval($_SESSION['user_id']);
        $cost_val = is_null($cost) || $cost === '' ? null : floatval($cost);

        $image_url = trim((string) ($input['image_url'] ?? ''));

        $is_pin = isset($input['is_pin']) ? intval($input['is_pin']) : 0;

        $stmt = $db->prepare('
            INSERT INTO sales (description, price, cost, owner_user_id, cashier_user_id, image_url, is_pin, sold_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ');
        $stmt->bind_param('sdsissi', $description, $price, $cost_val, $owner_user_id, $cashier_user_id, $image_url, $is_pin);

        if (!$stmt->execute()) {
            respond(['error' => 'Kon verkoop niet opslaan']);
        }

        respond(['ok' => true, 'id' => $db->insert_id]);
    }

    // LIST SALES
    if ($action === 'list_sales') {
        require_login();
        $date = $input['date'] ?? $_GET['date'] ?? date('Y-m-d');
        $stmt = $db->prepare('
            SELECT s.id, s.description, s.price, s.sold_at,
                s.image_url,
                s.owner_user_id, u_owner.name AS owner_name,
                s.cashier_user_id, u_cashier.name AS cashier_name
            FROM sales s
            JOIN users u_owner ON u_owner.id = s.owner_user_id
            JOIN users u_cashier ON u_cashier.id = s.cashier_user_id
            WHERE DATE(s.sold_at) = ? AND s.deleted = 0
            ORDER BY s.sold_at DESC
        ');
        $stmt->bind_param('s', $date);
        $stmt->execute();
        $res = $stmt->get_result();
        $sales = [];
        while ($row = $res->fetch_assoc()) {
            $row['id'] = (int) $row['id'];
            $row['owner_user_id'] = (int) $row['owner_user_id'];
            $row['cashier_user_id'] = (int) $row['cashier_user_id'];
            $sales[] = $row;
        }
        respond(['sales' => $sales]);
    }

    // DELETE SALE
    if ($action === 'delete_sale') {
        require_login();
        $id = intval($input['id'] ?? 0);
        if (!$id)
            respond(['error' => 'Ongeldig ID']);

        $stmt = $db->prepare('SELECT image_url FROM sales WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();

        $filePath = '';
        if ($row && !empty($row['image_url'])) {
            $basename = basename($row['image_url']);
            $filePath = uploads_dir() . $basename;
        }

        $stmt = $db->prepare('UPDATE sales SET deleted = 1, deleted_at = NOW() WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();

        if ($filePath && file_exists($filePath)) {
            @unlink($filePath);
        }

        respond(['ok' => true]);
    }

    // BREAKDOWN
    if ($action === 'breakdown') {
        require_login();
        $date = $input['date'] ?? date('Y-m-d');
        $range = $input['range'] ?? 'day';

        switch ($range) {
            case 'week':
                $start = date('Y-m-d', strtotime('monday this week', strtotime($date)));
                $end = date('Y-m-d', strtotime('sunday this week', strtotime($date)));
                $dateCondition = "DATE(s.sold_at) BETWEEN '$start' AND '$end'";
                break;
            case 'month':
                $start = date('Y-m-01', strtotime($date));
                $end = date('Y-m-t', strtotime($date));
                $dateCondition = "DATE(s.sold_at) BETWEEN '$start' AND '$end'";
                break;
            default: // day
                $dateCondition = "DATE(s.sold_at) = '$date'";
                break;
        }

        $stmt = $db->prepare("
            SELECT u.id AS owner_id, u.name AS owner_name, COALESCE(SUM(s.price),0) AS revenue
            FROM users u
            LEFT JOIN sales s ON s.owner_user_id = u.id AND $dateCondition AND s.deleted = 0
            WHERE u.active = 1
            GROUP BY u.id, u.name
            ORDER BY u.name
        ");
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        $total = 0.0;
        while ($row = $res->fetch_assoc()) {
            $rev = floatval($row['revenue']);
            $total += $rev;
            $rows[] = ['owner_id' => (int) $row['owner_id'], 'owner_name' => $row['owner_name'], 'revenue' => round($rev, 2)];
        }
        respond(['rows' => $rows, 'total' => round($total, 2)]);
    }


    // ------------------------
// UPLOAD QR IMAGE
// ------------------------
    if ($action === 'upload_qr') {
        require_login();

        if (!isset($_FILES['qr_image'])) {
            respond(['error' => 'Geen bestand ontvangen']);
        }

        $file = $_FILES['qr_image'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            respond(['error' => 'Fout bij upload']);
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $allowed = ['jpg', 'jpeg', 'png', 'gif'];
        if (!in_array($ext, $allowed)) {
            respond(['error' => 'Alleen JPG, PNG of GIF toegestaan']);
        }

        $targetDir = dirname(__DIR__) . '/env/uploads/';
        if (!is_dir($targetDir))
            mkdir($targetDir, 0777, true);
        if (!is_writable($targetDir))
            respond(['error' => 'Uploads map niet schrijfbaar']);

        // genereer unieke bestandsnaam
        $filename = time() . '_' . bin2hex(random_bytes(5)) . '.' . $ext;
        $target = $targetDir . $filename;

        if (!move_uploaded_file($file['tmp_name'], $target)) {
            respond(['error' => 'Kon bestand niet opslaan']);
        }

        // URL opbouwen voor frontend
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
        $host = $_SERVER['HTTP_HOST'];
        $basePath = '/flea_test/env/uploads'; // correct pad naar uploads vanaf de root
        $url = $scheme . '://' . $host . $basePath . '/' . $filename;

        respond([
            'success' => true,
            'filename' => $filename, // alleen bestandsnaam opslaan in DB
            'url' => $url               // volledige URL voor preview
        ]);
    }

    // PROCESS SETTLEMENT
    if ($action === 'process_settlement') {
        require_login();
        $uid = (int) $_SESSION['user_id'];
        $stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        if (!$row || (int) $row['is_admin'] !== 1) {
            respond(['error' => 'Niet gemachtigd']);
        }

        $db->begin_transaction();
        try {
            $res = $db->query('SELECT * FROM sales WHERE processed = 0 AND deleted = 0');
            $sales = [];
            while ($row = $res->fetch_assoc()) {
                $row['id'] = (int) $row['id'];
                $row['price'] = floatval($row['price']);
                $row['cashier_user_id'] = (int) $row['cashier_user_id'];
                $row['owner_user_id'] = (int) $row['owner_user_id'];
                $sales[] = $row;
            }

            $settlements = [];
            foreach ($sales as $sale) {
                if ($sale['cashier_user_id'] === $sale['owner_user_id'])
                    continue;
                $key = $sale['cashier_user_id'] . '_' . $sale['owner_user_id'];
                if (!isset($settlements[$key])) {
                    $settlements[$key] = [
                        'from_user_id' => $sale['cashier_user_id'],
                        'to_user_id' => $sale['owner_user_id'],
                        'amount' => 0,
                        'sales_ids' => []
                    ];
                }
                $settlements[$key]['amount'] += $sale['price'];
                $settlements[$key]['sales_ids'][] = $sale['id'];
            }

            foreach ($settlements as $s) {
                $sales_csv = implode(',', $s['sales_ids']);
                $stmt = $db->prepare('INSERT INTO settlements (from_user_id, to_user_id, amount, sales_ids) VALUES (?, ?, ?, ?)');
                $stmt->bind_param('iids', $s['from_user_id'], $s['to_user_id'], $s['amount'], $sales_csv);
                $stmt->execute();
                $ids_placeholder = implode(',', array_map('intval', $s['sales_ids']));
                $db->query("UPDATE sales SET processed = 1 WHERE id IN ($ids_placeholder)");
            }
            $db->commit();
            respond(['ok' => true, 'settlements' => array_values($settlements)]);
        } catch (Throwable $e) {
            $db->rollback();
            respond(['error' => 'Fout bij verrekenen']);
        }
    }

    // UPLOAD IMAGE
    if ($action === 'upload_image') {
        require_login();

        if (!isset($_FILES['image'])) {
            respond(['error' => 'Geen bestand ontvangen']);
        }

        $file = $_FILES['image'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            respond(['error' => 'Fout bij upload']);
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $allowed = ['jpg', 'jpeg', 'png', 'gif']; // HEIC/HEIF verwijderd
        if (!in_array($ext, $allowed)) {
            respond(['error' => 'Alleen JPG, PNG of GIF toegestaan']);
        }

        $targetDir = uploads_dir();
        if (!is_dir($targetDir))
            mkdir($targetDir, 0777, true);
        if (!is_writable($targetDir))
            respond(['error' => 'Uploads map niet schrijfbaar']);

        $filename = time() . '_' . bin2hex(random_bytes(5)) . '.jpg';
        $target = $targetDir . $filename;

        if (!move_uploaded_file($file['tmp_name'], $target)) {
            respond(['error' => 'Kon bestand niet opslaan']);
        }

        $url = uploads_url($filename);
        respond(['success' => true, 'url' => $url]);
    }
    if ($action === 'update_user') {
        $id = $input['id'] ?? null;  // let op: gebruik $input in plaats van $_POST
        if (!$id)
            respond(['error' => 'No user id']);

        $fields = [];
        $params = [];

        if (isset($input['iban'])) {
            $fields[] = "iban=?";
            $params[] = $input['iban'];
        }
        if (isset($input['qr_url'])) {
            $fields[] = "qr_url=?";
            $params[] = $input['qr_url'];
        }
        if (!$fields)
            respond(['error' => 'Nothing to update']);

        $params[] = $id;

        // Prepared statement dynamisch uitvoeren
        $stmt = $db->prepare("UPDATE users SET " . implode(',', $fields) . " WHERE id=?");

        // Bind dynamisch, werkt enkel met call_user_func_array
        $types = str_repeat('s', count($params) - 1) . 'i'; // laatste is id int
        $stmt->bind_param($types, ...$params);
        $stmt->execute();

        respond(['success' => true]);
    }

    // UPDATE OWNER QR
    if ($action === 'update_owner_qr') {
        require_login();

        $id = $input['id'] ?? null;
        $qr_url = $input['qr_url'] ?? null;

        if (!$id || !$qr_url)
            respond(['error' => 'Ongeldige invoer']);

        $stmt = $db->prepare("UPDATE users SET qr_url=? WHERE id=?");
        $stmt->bind_param('si', $qr_url, $id);
        if (!$stmt->execute())
            respond(['error' => 'Kon QR niet opslaan']);

        respond(['success' => true]);
    }

    respond(['error' => 'Onbekende actie']);

} catch (Throwable $e) {
    respond(['error' => 'Server error: ' . $e->getMessage()]);
}


