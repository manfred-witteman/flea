<?php
// api/api.php
declare(strict_types=1);
session_start();
error_log("API hit: action=" . ($action ?? 'NULL') . ", user_id=" . ($_SESSION['user_id'] ?? 'NULL'));

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? $_GET['action'] ?? null;

function respond($data) {
    echo json_encode($data);
    exit;
}

function require_login() {
    if (!isset($_SESSION['user_id'])) {
        respond(['error' => 'Niet ingelogd']);
    }
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

    // LIST USERS (exclude admin)
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

    // LIST SALES
    if ($action === 'list_sales') {
        require_login();
        $date = $input['date'] ?? $_GET['date'] ?? date('Y-m-d');
        $stmt = $db->prepare('
            SELECT 
                s.id, s.description, s.price, s.sold_at,
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
        if (!$id) respond(['error' => 'Ongeldig ID']);
        $stmt = $db->prepare('UPDATE sales SET deleted = 1, deleted_at = NOW() WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
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

    // PROCESS SETTLEMENT (admin only)
    if ($action === 'process_settlement') {
        require_login();

        // Alleen admin mag dit
        $uid = (int) $_SESSION['user_id'];
        $stmt = $db->prepare('SELECT is_admin FROM users WHERE id = ?');
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        if (!$row || (int)$row['is_admin'] !== 1) {
            respond(['error' => 'Niet gemachtigd']);
        }

        error_log("Verrekenen gestart door user_id=" . $_SESSION['user_id']);

        $db->begin_transaction();
        try {
            // Haal alle niet-verwerkte sales
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

            // Bereken onderlinge verrekeningen
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

            // Opslaan in settlements + markeer sales als processed
            foreach ($settlements as $s) {
                $sales_csv = implode(',', $s['sales_ids']);
                $stmt = $db->prepare('INSERT INTO settlements (from_user_id, to_user_id, amount, sales_ids) VALUES (?, ?, ?, ?)');
                $stmt->bind_param('iids', $s['from_user_id'], $s['to_user_id'], $s['amount'], $sales_csv);
                $stmt->execute();

                $ids_placeholder = implode(',', array_map('intval', $s['sales_ids']));
                $db->query("UPDATE sales SET processed = 1 WHERE id IN ($ids_placeholder)");
            }

            error_log("Settlements berekend: " . json_encode($settlements));

            $db->commit();

            respond(['ok' => true, 'settlements' => array_values($settlements)]);
        } catch (Throwable $e) {
            error_log("Fout bij verrekenen: " . $e->getMessage());
            $db->rollback();
            respond(['error' => 'Fout bij verrekenen']);
        }
    }

    respond(['error' => 'Onbekende actie']);

} catch (Throwable $e) {
    respond(['error' => 'Server error']);
}
