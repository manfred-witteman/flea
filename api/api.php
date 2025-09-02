<?php
// api/api.php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? $_GET['action'] ?? null;

function respond($data) { echo json_encode($data); exit; }
function require_login() {
    if (!isset($_SESSION['user_id'])) {
        respond(['error' => 'Niet ingelogd']);
    }
}

try {
    $db = db();

    if ($action === 'login') {
        $email = trim($input['email'] ?? '');
        $password = $input['password'] ?? '';
        if (!$email || !$password) respond(['error' => 'E-mail en wachtwoord vereist']);
        $stmt = $db->prepare('SELECT id, name, email, password_hash FROM users WHERE email = ? AND active = 1');
        $stmt->bind_param('s', $email);
        $stmt->execute();
        $res = $stmt->get_result();
        $user = $res->fetch_assoc();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            respond(['error' => 'Ongeldige inlog']);
        }
        $_SESSION['user_id'] = (int)$user['id'];
        respond(['ok' => true, 'user' => ['id' => (int)$user['id'], 'name' => $user['name'], 'email' => $user['email']]]);
    }

    if ($action === 'me') {
        if (!isset($_SESSION['user_id'])) respond(['user' => null]);
        $uid = (int)$_SESSION['user_id'];
        $stmt = $db->prepare('SELECT id, name, email FROM users WHERE id = ?');
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $res = $stmt->get_result();
        $user = $res->fetch_assoc();
        respond(['user' => $user]);
    }

    if ($action === 'logout') {
        session_destroy();
        respond(['ok' => true]);
    }

    if ($action === 'list_users') {
    require_login();
    $res = $db->query('SELECT id, name FROM users WHERE active = 1 AND is_admin = 0 ORDER BY name');
    $users = [];
    while ($row = $res->fetch_assoc()) $users[] = ['id' => (int)$row['id'], 'name' => $row['name']];
    respond(['users' => $users]);
}

    if ($action === 'add_sale') {
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
        $stmt = $db->prepare('INSERT INTO sales (description, price, cost, owner_user_id, cashier_user_id, sold_at) VALUES (?, ?, ?, ?, ?, NOW())');
        $stmt->bind_param('sdsii', $description, $price, $cost_val, $owner_user_id, $cashier_user_id);
        $ok = $stmt->execute();
        if (!$ok) respond(['error' => 'Kon verkoop niet opslaan']);
        respond(['ok' => true, 'id' => $db->insert_id]);
    }

    if ($action === 'list_sales') {
        require_login();
        $date = $input['date'] ?? $_GET['date'] ?? date('Y-m-d');
        $stmt = $db->prepare('
            SELECT 
                s.id, 
                s.description, 
                s.price, 
                s.sold_at, 
                s.owner_user_id,
                u_owner.name AS owner_name,
                s.cashier_user_id,
                u_cashier.name AS cashier_name
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

    if ($action === 'delete_sale') {
        require_login();
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['error' => 'Ongeldig ID']);
        $stmt = $db->prepare('UPDATE sales SET deleted = 1, deleted_at = NOW() WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        respond(['ok' => true]);
    }

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

    respond(['error' => 'Onbekende actie']);
} catch (Throwable $e) {
    respond(['error' => 'Server error']);
}
