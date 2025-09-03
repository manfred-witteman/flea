<?php
// api/api.php
declare(strict_types=1);

ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

// No-cache headers om iOS standalone caching te voorkomen
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');


session_start();

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// Functie om JSON response te sturen
function respond($data) {
    echo json_encode($data);
    exit;
}

// Controleer of user is ingelogd
function require_login() {
    if (!isset($_SESSION['user_id'])) {
        respond(['error' => 'Niet ingelogd']);
    }
}

// Lees POST JSON body
$input = json_decode(file_get_contents('php://input'), true) ?? [];

// Bepaal action
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
        if (!$email || !$password) respond(['error' => 'E-mail en wachtwoord vereist']);

        $stmt = $db->prepare('SELECT id, name, email, password_hash, is_admin FROM users WHERE email = ? AND active = 1');
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
                'id' => (int) $user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'is_admin' => (int) $user['is_admin']
            ]
        ]);
    }

    // CURRENT USER
    if ($action === 'me') {
        if (!isset($_SESSION['user_id'])) respond(['user' => null]);
        $uid = (int)$_SESSION['user_id'];
        $stmt = $db->prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?');
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $res = $stmt->get_result();
        $user = $res->fetch_assoc();
        $user['id'] = (int)$user['id'];
        $user['is_admin'] = (int)$user['is_admin'];
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
        $res = $db->query('SELECT id, name FROM users WHERE active = 1 AND is_admin = 0 ORDER BY name');
        $users = [];
        while ($row = $res->fetch_assoc()) {
            $users[] = ['id' => (int)$row['id'], 'name' => $row['name']];
        }
        respond(['users' => $users]);
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

    // ✅ Zorg dat image_url altijd een string is
    $image_url = trim((string)($input['image_url'] ?? ''));

    $stmt = $db->prepare('
        INSERT INTO sales (description, price, cost, owner_user_id, cashier_user_id, image_url, sold_at) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
    ');
    $stmt->bind_param('sdsiss', $description, $price, $cost_val, $owner_user_id, $cashier_user_id, $image_url);

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
            $row['id'] = (int)$row['id'];
            $row['owner_user_id'] = (int)$row['owner_user_id'];
            $row['cashier_user_id'] = (int)$row['cashier_user_id'];
            $sales[] = $row;
        }
        respond(['sales' => $sales]);
    }

   
    // DELETE SALE
if ($action === 'delete_sale') {
    require_login();
    $id = intval($input['id'] ?? 0);
    $image_url = trim($input['image_url'] ?? '');

    if (!$id) respond(['error' => 'Ongeldig ID']);

    // 1️⃣ Haal het bijbehorende record op
    $stmt = $db->prepare('SELECT image_url FROM sales WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res->fetch_assoc();
    $filePath = '';
    if ($row && !empty($row['image_url'])) {
        // Map aanmaken naar file system path
        $filePath = __DIR__ . str_replace('/flea/api', '', $row['image_url']); 
        error_log("DELETE SALE: image_url={$row['image_url']}, filePath={$filePath}");
    }

    // 2️⃣ Markeer als deleted
    $stmt = $db->prepare('UPDATE sales SET deleted = 1, deleted_at = NOW() WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();

    // 3️⃣ Verwijder bestand van server
    if ($filePath && file_exists($filePath)) {
        if (@unlink($filePath)) {
            error_log("DELETE SALE: bestand verwijderd: {$filePath}");
        } else {
            error_log("DELETE SALE: kon bestand niet verwijderen: {$filePath}");
        }
    } else {
        error_log("DELETE SALE: bestand niet gevonden of geen image_url");
    }

    respond(['ok' => true]);
}

     

    // BREAKDOWN
    if ($action === 'breakdown') {
        require_login();
        $date = $input['date'] ?? date('Y-m-d');
        $stmt = $db->prepare('
            SELECT u.id AS owner_id, u.name AS owner_name, COALESCE(SUM(s.price),0) AS revenue
            FROM users u
            LEFT JOIN sales s ON s.owner_user_id = u.id AND DATE(s.sold_at) = ? AND s.deleted = 0
            WHERE u.active = 1
            GROUP BY u.id, u.name
            ORDER BY u.name
        ');
        $stmt->bind_param('s', $date);
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
    }

    // PROCESS SETTLEMENT
    if ($action === 'process_settlement') {
        require_login();
        $uid = (int)$_SESSION['user_id'];
        $stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        if (!$row || (int)$row['is_admin'] !== 1) {
            respond(['error' => 'Niet gemachtigd']);
        }

        $db->begin_transaction();
        try {
            $res = $db->query('SELECT * FROM sales WHERE processed = 0 AND deleted = 0');
            $sales = [];
            while ($row = $res->fetch_assoc()) {
                $row['id'] = (int)$row['id'];
                $row['price'] = floatval($row['price']);
                $row['cashier_user_id'] = (int)$row['cashier_user_id'];
                $row['owner_user_id'] = (int)$row['owner_user_id'];
                $sales[] = $row;
            }

            $settlements = [];
            foreach ($sales as $sale) {
                if ($sale['cashier_user_id'] === $sale['owner_user_id']) continue;
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
    $allowed = ['jpg','jpeg','png','gif','heic','heif'];
    if (!in_array($ext, $allowed)) {
        respond(['error' => 'Alleen JPG, PNG, GIF of HEIC toegestaan']);
    }

    $targetDir = __DIR__ . '/uploads/';
    if (!is_dir($targetDir)) mkdir($targetDir, 0777, true);
    if (!is_writable($targetDir)) respond(['error' => 'Uploads map niet schrijfbaar']);

    $filename = time() . '_' . bin2hex(random_bytes(5)) . '.jpg'; // we slaan alles op als JPG
    $target = $targetDir . $filename;

    try {
        if (in_array($ext, ['heic','heif'])) {
    try {
        $img = new Imagick($file['tmp_name']);
        $img->setImageFormat('jpeg');
        $ok = $img->writeImage($target);
        $img->clear();
        $img->destroy();

        if (!$ok || !file_exists($target)) {
            respond(['error' => 'HEIC niet ondersteund op deze server. Upload JPG of PNG.']);
        }
    } catch (Throwable $e) {
        respond(['error' => 'HEIC conversie mislukt: ' . $e->getMessage()]);
    }
} else {
            if (!move_uploaded_file($file['tmp_name'], $target)) {
                respond(['error' => 'Kon bestand niet opslaan']);
            }
        }
    } catch (Throwable $e) {
        respond(['error' => 'Fout bij verwerken afbeelding: ' . $e->getMessage()]);
    }

    // URL teruggeven
    $url = '/flea/api/uploads/' . $filename;
    respond(['success' => true, 'url' => $url]);
}

    respond(['error' => 'Onbekende actie']);

} catch (Throwable $e) {
    respond(['error' => 'Server error: ' . $e->getMessage()]);
}
