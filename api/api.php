<?php
declare(strict_types=1);

// ------------------------
// FOUTAFHANDELING & LOGGING
// ------------------------

ini_set('display_errors', 1);
ini_set('log_errors', '1');
ini_set('error_log', dirname(__DIR__) . '/env/logs/php_errors.log');
error_reporting(E_ALL);

// ------------------------
// HEADERS
// ------------------------
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

// ------------------------
// SESSION & CONFIG
// ------------------------
session_start();
require_once dirname(__DIR__) . '/env/config.php';
require_once dirname(__DIR__) . '/env/db.php';

// ------------------------
// HELPERS
// ------------------------
function respond(array $data)
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

function uploads_url($filename) {
    // Dynamisch de root detecteren, geen /api/ in de URL
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'];

    // Vind de base path van het project
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']); // bv. /flea_test/api
    $basePath = preg_replace('#/api$#', '', $scriptDir); // verwijder /api

    return $protocol . "://" . $host . $basePath . "/env/uploads/" . ltrim($filename, '/');
}

// ------------------------
// INPUT
// ------------------------
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_POST['action'] ?? $input['action'] ?? $_GET['action'] ?? null;

// ------------------------
// TRY / CATCH HOOK
// ------------------------
try {
    $db = db();

    switch ($action) {

        // -------------------
        case 'login':
            $email = trim($input['email'] ?? '');
            $password = $input['password'] ?? '';
            if (!$email || !$password) respond(['error' => 'E-mail en wachtwoord vereist']);

            $stmt = $db->prepare('SELECT id, name, email, password_hash, is_admin FROM users WHERE email=? AND active=1');
            $stmt->bind_param('s', $email);
            $stmt->execute();
            $res = $stmt->get_result();
            $user = $res->fetch_assoc();
            if (!$user || !password_verify($password, $user['password_hash'])) {
                respond(['error' => 'Ongeldige inlog']);
            }
            $_SESSION['user_id'] = (int)$user['id'];
            respond([
                'ok' => true,
                'user' => [
                    'id' => (int)$user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'is_admin' => (int)$user['is_admin']
                ]
            ]);
            break;

        case 'me':
            if (!isset($_SESSION['user_id'])) respond(['user' => null]);
            $uid = (int)$_SESSION['user_id'];
            $stmt = $db->prepare('SELECT id, name, email, is_admin FROM users WHERE id=?');
            $stmt->bind_param('i', $uid);
            $stmt->execute();
            $res = $stmt->get_result();
            $user = $res->fetch_assoc();
            $user['id'] = (int)$user['id'];
            $user['is_admin'] = (int)$user['is_admin'];
            respond(['user' => $user]);
            break;

        case 'logout':
            session_destroy();
            respond(['ok' => true]);
            break;

        case 'list_users':
            require_login();
            $res = $db->query('SELECT id, name, iban, qr_url FROM users WHERE active=1 AND is_admin=0 ORDER BY name');
            $users = [];
            while ($row = $res->fetch_assoc()) {
                $users[] = [
                    'id' => (int)$row['id'],
                    'name' => $row['name'],
                    'iban' => $row['iban'],
                    'qr_url' => $row['qr_url']
                ];
            }
            respond(['users' => $users]);
            break;



        // ------------------------
        // DELETE MAPPING (qr_config)
        // ------------------------
        case 'delete_mapping':
            require_login();
            $ownerId = intval($input['owner_user_id'] ?? 0);
            if (!$ownerId) respond(['error' => 'Geen geldig ID']);
            $stmt = $db->prepare("DELETE FROM qr_config WHERE owner_user_id = ?");
            $stmt->bind_param('i', $ownerId);
            if (!$stmt->execute()) respond(['error' => 'Kon mapping niet verwijderen']);
            respond(['success' => true]);
            break;


        case 'add_sale':
            require_login();
            $description = trim($input['description'] ?? '');
            $price = $input['price'] ?? null;
            $cost = $input['cost'] ?? null;
            $owner_user_id = $input['owner_user_id'] ?? null;
            if (!$description || !is_numeric($price) || !$owner_user_id) respond(['error' => 'Ongeldige invoer']);
            $price = floatval($price);
            $owner_user_id = intval($owner_user_id);
            $cashier_user_id = intval($_SESSION['user_id']);
            $cost_val = is_null($cost) || $cost === '' ? null : floatval($cost);
            $image_url = trim((string)($input['image_url'] ?? ''));
            $is_pin = isset($input['is_pin']) ? intval($input['is_pin']) : 0;
            $stmt = $db->prepare('INSERT INTO sales (description, price, cost, owner_user_id, cashier_user_id, image_url, is_pin, sold_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())');
            $stmt->bind_param('sdsissi', $description, $price, $cost_val, $owner_user_id, $cashier_user_id, $image_url, $is_pin);
            if (!$stmt->execute()) respond(['error' => 'Kon verkoop niet opslaan']);
            respond(['ok' => true, 'id' => $db->insert_id]);
            break;

        case 'list_sales':
            require_login();
            $date = $input['date'] ?? $_GET['date'] ?? date('Y-m-d');
            $stmt = $db->prepare('
                SELECT s.id, s.description, s.price, s.sold_at, s.image_url,
                    s.owner_user_id, u_owner.name AS owner_name,
                    s.cashier_user_id, u_cashier.name AS cashier_name,
                    s.is_pin
                FROM sales s
                JOIN users u_owner ON u_owner.id = s.owner_user_id
                JOIN users u_cashier ON u_cashier.id = s.cashier_user_id
                WHERE DATE(s.sold_at)=? AND s.deleted=0
                ORDER BY s.sold_at DESC
            ');
            $stmt->bind_param('s', $date);
            $stmt->execute();
            $res = $stmt->get_result();
            $sales = [];
            while ($row = $res->fetch_assoc()) {
                $row['id'] = (int)$row['id'];
                $row['owner_user_id'] = (int)$row['owner_user_id'];
                $row['cashier_user_id'] = (int)$row['cashier_user_id'];
                $row['is_pin'] = (int)$row['is_pin']; // <--- toevoegen
                $sales[] = $row;
            }
            respond(['sales' => $sales]);
            break;

        case 'delete_sale':
            require_login();
            $id = intval($input['id'] ?? 0);
            if (!$id) respond(['error' => 'Ongeldig ID']);
            $stmt = $db->prepare('SELECT image_url FROM sales WHERE id=?');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $res = $stmt->get_result();
            $row = $res->fetch_assoc();
            $filePath = $row['image_url'] ? uploads_dir() . basename($row['image_url']) : '';
            $stmt = $db->prepare('UPDATE sales SET deleted=1, deleted_at=NOW() WHERE id=?');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            if ($filePath && file_exists($filePath)) @unlink($filePath);
            respond(['ok' => true]);
            break;

        case 'breakdown':
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
                default:
                    $dateCondition = "DATE(s.sold_at)='$date'";
            }
            $stmt = $db->prepare("
                SELECT u.id AS owner_id, u.name AS owner_name, COALESCE(SUM(s.price),0) AS revenue
                FROM users u
                LEFT JOIN sales s ON s.owner_user_id=u.id AND $dateCondition AND s.deleted=0
                WHERE u.active=1
                GROUP BY u.id,u.name
                ORDER BY u.name
            ");
            $stmt->execute();
            $res = $stmt->get_result();
            $rows = [];
            $total = 0.0;
            while ($row = $res->fetch_assoc()) {
                $rev = floatval($row['revenue']);
                $total += $rev;
                $rows[] = ['owner_id' => (int)$row['owner_id'], 'owner_name' => $row['owner_name'], 'revenue' => round($rev, 2)];
            }
            respond(['rows' => $rows, 'total' => round($total, 2)]);
            break;

        // ------------------------
        // GET QR FOR OWNER
        // ------------------------
       case 'get_qr_for_owner':
        require_login();

        $ownerId = intval($input["owner_user_id"] ?? 0);
        if (!$ownerId) {
            respond(null); // ongeldig owner ID → gewoon null
        }

        $stmt = $db->prepare('
            SELECT u.id AS qr_user_id, u.qr_url
            FROM qr_config q
            JOIN users u ON u.id = q.qr_user_id
            WHERE q.owner_user_id = ?
            LIMIT 1
        ');
        $stmt->bind_param('i', $ownerId);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();

        if ($row && !empty($row['qr_url'])) {
            $qrFileName = basename($row['qr_url']);
            $qrFullUrl = uploads_url($qrFileName);

            respond([
                'success' => true,
                'qr_user_id' => (int)$row['qr_user_id'],
                'qr_url' => $qrFullUrl
            ]);
        } else {
            respond([]);
        }
        break;

        // ------------------------
        // UPLOAD IMAGE
        // ------------------------
        case 'upload_image':
            require_login();
            if (!isset($_FILES['image'])) respond(['error' => 'Geen bestand ontvangen']);
            $file = $_FILES['image'];
            if ($file['error'] !== UPLOAD_ERR_OK) respond(['error' => 'Fout bij upload']);
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $allowed = ['jpg','jpeg','png','gif'];
            if (!in_array($ext, $allowed)) respond(['error' => 'Alleen JPG, PNG of GIF toegestaan']);
            $targetDir = uploads_dir();
            if (!is_dir($targetDir)) mkdir($targetDir, 0777, true);
            if (!is_writable($targetDir)) respond(['error' => 'Uploads map niet schrijfbaar']);
            $filename = time() . '_' . bin2hex(random_bytes(5)) . '.jpg';
            $target = $targetDir . $filename;
            if (!move_uploaded_file($file['tmp_name'], $target)) respond(['error' => 'Kon bestand niet opslaan']);
            $url = uploads_url($filename);
            respond(['success' => true, 'url' => $url]);
            break;

                // ------------------------
        // UPDATE USER (iban + qr_url)
        // ------------------------
        case 'update_user':
            require_login();
            $id = intval($input['id'] ?? 0);
            $iban = trim($input['iban'] ?? '');
            $qr_url = trim($input['qr_url'] ?? '');
            if (!$id) respond(['error' => 'Geen geldig ID']);
            $stmt = $db->prepare("UPDATE users SET iban = ?, qr_url = ? WHERE id = ?");
            $stmt->bind_param('ssi', $iban, $qr_url, $id);
            if (!$stmt->execute()) respond(['error' => 'Kon gebruiker niet updaten']);
            respond(['success' => true]);
            break;

        // ------------------------
        // LIST MAPPINGS (qr_config)
        // ------------------------
        case 'list_mappings':
            require_login();
            $res = $db->query("
                SELECT q.owner_user_id AS owner_id, u1.name AS owner_name,
                       q.qr_user_id, u2.name AS qr_user_name
                FROM qr_config q
                JOIN users u1 ON u1.id = q.owner_user_id
                LEFT JOIN users u2 ON u2.id = q.qr_user_id
            ");
            $rows = [];
            while ($row = $res->fetch_assoc()) {
                $rows[] = [
                    'owner_id' => (int)$row['owner_id'],
                    'owner_name' => $row['owner_name'],
                    'qr_user_id' => (int)$row['qr_user_id'],
                    'qr_user_name' => $row['qr_user_name']
                ];
            }
            respond(['mappings' => $rows]);
            break;

        // ------------------------
        // UPDATE MAPPING (qr_config)
        // ------------------------
       case 'update_mapping':
    require_login();
    $ownerId = intval($input['owner_user_id'] ?? 0);
    $qrUserId = isset($input['qr_user_id']) ? $input['qr_user_id'] : null;

    if (!$ownerId) respond(['error' => 'Owner is verplicht']);

    if ($qrUserId === null) {
        // QR-user is null
        $stmt = $db->prepare("
            INSERT INTO qr_config (owner_user_id, qr_user_id)
            VALUES (?, NULL)
            ON DUPLICATE KEY UPDATE qr_user_id = NULL
        ");
        $stmt->bind_param('i', $ownerId);
    } else {
        $stmt = $db->prepare("
            INSERT INTO qr_config (owner_user_id, qr_user_id)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE qr_user_id = VALUES(qr_user_id)
        ");
        $stmt->bind_param('ii', $ownerId, $qrUserId);
    }

    if (!$stmt->execute()) respond(['error' => 'Kon mapping niet opslaan']);
    respond(['success' => true]);
    break;


      
    }

} catch (Throwable $e) {
    error_log($e->getMessage());
    respond(['error' => 'Serverfout: ' . $e->getMessage()]);
}
