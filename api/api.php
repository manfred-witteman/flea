<?php
declare(strict_types=1);

error_log("API executing from: " . __DIR__);

// ------------------------
// FOUTAFHANDELING & LOGGING
// ------------------------

ini_set('display_errors', 1);
ini_set('log_errors', '1');
ini_set('error_log', dirname(__DIR__) . '/env/logs/php_errors.log');
error_reporting(E_ALL);

error_log("🔥 API started: " . date('Y-m-d H:i:s'));

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
    return rtrim(UPLOADS_DIR, '/') . '/';
}

function uploads_url($filename)
{
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'];
    return $protocol . "://" . $host . UPLOADS_URL_BASE . ltrim($filename, '/');
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
            if (!$email || !$password)
                respond(['error' => 'E-mail en wachtwoord vereist']);

            $stmt = $db->prepare('SELECT id, name, email, password_hash, is_admin FROM users WHERE email=? AND active=1');
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
            break;

        case 'me':
            if (!isset($_SESSION['user_id']))
                respond(['user' => null]);
            $uid = (int) $_SESSION['user_id'];
            $stmt = $db->prepare('SELECT id, name, email, is_admin FROM users WHERE id=?');
            $stmt->bind_param('i', $uid);
            $stmt->execute();
            $res = $stmt->get_result();
            $user = $res->fetch_assoc();
            $user['id'] = (int) $user['id'];
            $user['is_admin'] = (int) $user['is_admin'];
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
                    'id' => (int) $row['id'],
                    'name' => $row['name'],
                    'iban' => $row['iban'],
                    'qr_filename' => $row['qr_url'] // just filename
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
            if (!$ownerId)
                respond(['error' => 'Geen geldig ID']);
            $stmt = $db->prepare("DELETE FROM qr_config WHERE owner_user_id = ?");
            $stmt->bind_param('i', $ownerId);
            if (!$stmt->execute())
                respond(['error' => 'Kon mapping niet verwijderen']);
            respond(['success' => true]);
            break;


        case 'add_sale':
            require_login();

            $description = trim($input['description'] ?? '');
            $price = $input['price'] ?? null;
            $cost = $input['cost'] ?? null;
            $owner_user_id = $input['owner_user_id'] ?? null;
            $image_filename = trim((string) ($input['image_url'] ?? ''));
            $is_pin = isset($input['is_pin']) ? intval($input['is_pin']) : 0;
            $qr_id = $input['qr_id'] ?? null;

            error_log("DEBUG add_sale: " . json_encode($input));

            // Validatie
            if (!$description && !$qr_id) { // handmatige verkoop vereist description
                respond(['error' => 'Ongeldige invoer']);
            }

            $price = floatval($price);
            $owner_user_id = intval($owner_user_id);
            $cashier_user_id = intval($_SESSION['user_id']);
            $cost_val = is_null($cost) || $cost === '' ? null : floatval($cost);
            $image_filename = $image_filename ? basename($image_filename) : null;

            // Timestamp
            $now = date('Y-m-d H:i:s');

            if ($qr_id) {
                // ✅ Update bestaande verkoop met alle waarden
                $stmt = $db->prepare('
            UPDATE sales
            SET description = ?, price = ?, cost = ?, owner_user_id = ?, cashier_user_id = ?,
                image_url = ?, is_pin = ?, sold_at = ?
            WHERE qr_id = ?
        ');
                if (!$stmt) {
                    respond(['error' => 'Kon update niet voorbereiden: ' . $db->error]);
                }
                $stmt->bind_param(
                    'sdsississ',
                    $description,
                    $price,
                    $cost_val,
                    $owner_user_id,
                    $cashier_user_id,
                    $image_filename,
                    $is_pin,
                    $now,
                    $qr_id
                );
                if (!$stmt->execute()) {
                    respond(['error' => 'Kon verkoop niet updaten: ' . $stmt->error]);
                }
                if ($stmt->affected_rows === 0) {
                    respond(['error' => 'Geen verkoop gevonden voor deze QR-code']);
                }
                respond(['ok' => true, 'updated' => true]);
            } else {
                // ✅ Insert nieuwe verkoop
                $stmt = $db->prepare('
            INSERT INTO sales (description, price, cost, owner_user_id, cashier_user_id, image_url, is_pin, sold_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ');
                if (!$stmt) {
                    respond(['error' => 'Kon insert niet voorbereiden: ' . $db->error]);
                }
                $stmt->bind_param(
                    'sdsissis',
                    $description,
                    $price,
                    $cost_val,
                    $owner_user_id,
                    $cashier_user_id,
                    $image_filename,
                    $is_pin,
                    $now
                );
                if (!$stmt->execute()) {
                    respond(['error' => 'Kon verkoop niet opslaan: ' . $stmt->error]);
                }
                respond(['ok' => true, 'updated' => false, 'id' => $db->insert_id]);
            }

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
                $row['id'] = (int) $row['id'];
                $row['owner_user_id'] = (int) $row['owner_user_id'];
                $row['cashier_user_id'] = (int) $row['cashier_user_id'];
                $row['is_pin'] = (int) $row['is_pin'];

                if (!empty($row['image_url'])) {
                    $row['image_url'] = uploads_url($row['image_url']);
                }

                $sales[] = $row;
            }
            respond(['sales' => $sales]);
            break;

        case 'delete_sale':
            require_login();
            $id = intval($input['id'] ?? 0);
            if (!$id)
                respond(['error' => 'Ongeldig ID']);
            $stmt = $db->prepare('SELECT image_url FROM sales WHERE id=?');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $res = $stmt->get_result();
            $row = $res->fetch_assoc();
            $filePath = !empty($row['image_url']) ? uploads_dir() . $row['image_url'] : '';
            $stmt = $db->prepare('UPDATE sales SET deleted=1, deleted_at=NOW() WHERE id=?');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            if ($filePath && file_exists($filePath))
                @unlink($filePath);
            respond(['ok' => true]);
            break;



        case 'add_purchase':
            require_login();

            // Input ophalen en trimmen
            $description = trim($input['description'] ?? '');
            $purchased_at = $input['purchased_at'] ?? date('Y-m-d H:i:s');
            $purchase_remarks = trim($input['purchase_remarks'] ?? '');
            $owner_user_id = $input['owner_user_id'] ?? null;
            $purchase_is_pin = isset($input['purchase_is_pin']) ? intval($input['purchase_is_pin']) : 0;
            $target_price = isset($input['target_price']) ? floatval($input['target_price']) : null;
            $qr_id = !empty($input['qr_id']) ? trim((string) $input['qr_id']) : null;
            $cost = isset($input['cost']) ? floatval($input['cost']) : null;
            $image_filename = trim((string) ($input['image_url'] ?? ''));

            // Validatie
            if (!$description || !$owner_user_id || $cost === null) {
                error_log('add_purchase: Ongeldige invoer: ' . print_r($input, true));
                respond(['error' => 'Ongeldige invoer']);
            }

            $owner_user_id = intval($owner_user_id);
            $cashier_user_id = intval($_SESSION['user_id']);
            $image_filename = $image_filename ? basename($image_filename) : null;
            $purchase_remarks = $purchase_remarks ?: null;
            $target_price = $target_price !== null ? $target_price : null;
            $qr_id = $qr_id ?: null;

            // Prepare statement
            $stmt = $db->prepare('
                    INSERT INTO sales
                    (description, cost, owner_user_id, cashier_user_id, purchased_at, purchase_remarks, purchase_is_pin, target_price, qr_id, image_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ');

            if (!$stmt) {
                error_log('add_purchase: Prepare failed: ' . $db->error);
                respond(['error' => 'Kon inkoop niet voorbereiden']);
            }

            // Bind parameters
            if (
                !$stmt->bind_param(
                    'sdissidsis',
                    $description,
                    $cost,
                    $owner_user_id,
                    $cashier_user_id,
                    $purchased_at,
                    $purchase_remarks,
                    $purchase_is_pin,
                    $target_price,
                    $qr_id,
                    $image_filename
                )
            ) {
                error_log('add_purchase: Bind failed: ' . $stmt->error . ' | Input: ' . print_r($input, true));
                respond(['error' => 'Kon inkoop niet binden']);
            }

            // Execute
            if (!$stmt->execute()) {
                error_log('add_purchase: Execute failed: ' . $stmt->error . ' | Input: ' . print_r($input, true));
                respond(['error' => 'Kon inkoop niet opslaan']);
            }

            respond(['ok' => true, 'id' => $db->insert_id]);
            break;

        case 'list_purchases':
            require_login();

            // Log dat we in list_purchases komen (tijdelijk, voor debugging)
            error_log("DEBUG list_purchases called by user_id=" . intval($_SESSION['user_id'] ?? 0));

            $stmt = $db->prepare('
        SELECT id, description, cost, image_url, purchase_is_pin, purchase_remarks,
               target_price, qr_id, purchased_at, sold_at, owner_user_id, cashier_user_id, deleted
        FROM sales
        WHERE purchased_at IS NOT NULL
          AND (sold_at IS NULL OR sold_at = "")
          AND deleted = 0
        ORDER BY purchased_at DESC
    ');

            if (!$stmt) {
                error_log("list_purchases prepare failed: " . $db->error);
                respond(['error' => 'Kon purchases niet ophalen']);
            }

            if (!$stmt->execute()) {
                error_log("list_purchases execute failed: " . $stmt->error);
                respond(['error' => 'Kon purchases niet ophalen']);
            }

            $res = $stmt->get_result();
            $purchases = $res->fetch_all(MYSQLI_ASSOC);

            // Log how many rows we fetched (voor debugging)
            error_log("DEBUG list_purchases fetched: " . count($purchases) . " rows");

            // Normaliseer en formatteer data voor frontend
            foreach ($purchases as &$p) {
                // cast ints
                $p['id'] = (int) $p['id'];
                $p['owner_user_id'] = isset($p['owner_user_id']) ? (int) $p['owner_user_id'] : null;
                $p['cashier_user_id'] = isset($p['cashier_user_id']) ? (int) $p['cashier_user_id'] : null;
                $p['deleted'] = (int) ($p['deleted'] ?? 0);

                // normaliseer qr_id: empty string -> null
                if (!isset($p['qr_id']) || $p['qr_id'] === '' || strtolower($p['qr_id']) === 'null') {
                    $p['qr_id'] = null;
                }

                // image_url -> full URL (or null)
                if (!empty($p['image_url'])) {
                    $p['image_url'] = uploads_url($p['image_url']);
                } else {
                    $p['image_url'] = null;
                }
            }
            unset($p);

            // Log first row for quick inspection (if exists)
            if (count($purchases) > 0) {
                error_log("DEBUG list_purchases sample: " . json_encode($purchases[0]));
            }

            respond(['purchases' => $purchases]);
            break;


        case 'update_purchase':
            require_login();

            $id = intval($input['id'] ?? 0);
            $image_filename = trim((string) ($input['image_url'] ?? ''));

            if (!$id || !$image_filename) {
                respond(['error' => 'Ongeldige invoer']);
            }

            $image_filename = basename($image_filename); // beveiliging
            $stmt = $db->prepare('UPDATE sales SET image_url = ? WHERE id = ?');
            if (!$stmt) {
                respond(['error' => 'Kon update niet voorbereiden']);
            }

            $stmt->bind_param('si', $image_filename, $id);
            if (!$stmt->execute()) {
                respond(['error' => 'Kon image_url niet bijwerken: ' . $stmt->error]);
            }

            respond(['success' => true, 'id' => $id]);
            break;


        case 'attach_qr':
            require_login();

            $id = intval($input['id'] ?? 0);
            $qr_id = trim((string) ($input['qr_id'] ?? ''));

            // Basic validation
            if (!$id || !$qr_id) {
                respond(['error' => 'Ongeldige invoer']);
            }

            // Controleer of de verkoop bestaat
            $stmt = $db->prepare('SELECT id, qr_id FROM sales WHERE id = ? LIMIT 1');
            if (!$stmt) {
                respond(['error' => 'Databasefout bij voorbereiden SELECT']);
            }
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $res = $stmt->get_result();
            $sale = $res->fetch_assoc();
            $stmt->close();

            if (!$sale) {
                respond(['error' => 'Verkoop niet gevonden']);
            }

            // Check of er al een QR gekoppeld is
            if (!empty($sale['qr_id'])) {
                respond(['error' => 'Er is al een QR-code gekoppeld']);
            }

            // Koppel de QR
            $stmt = $db->prepare('UPDATE sales SET qr_id = ? WHERE id = ?');
            if (!$stmt) {
                respond(['error' => 'Databasefout bij voorbereiden UPDATE']);
            }
            $stmt->bind_param('si', $qr_id, $id);

            if (!$stmt->execute()) {
                respond(['error' => 'Kon QR-code niet koppelen']);
            }

            respond(['ok' => true, 'id' => $id, 'qr_id' => $qr_id]);
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
                $rows[] = ['owner_id' => (int) $row['owner_id'], 'owner_name' => $row['owner_name'], 'revenue' => round($rev, 2)];
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
                respond([
                    'success' => true,
                    'qr_user_id' => (int) $row['qr_user_id'],
                    'qr_filename' => $row['qr_url'] // just filename
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
            if (!isset($_FILES['image']))
                respond(['error' => 'Geen bestand ontvangen']);
            $file = $_FILES['image'];
            if ($file['error'] !== UPLOAD_ERR_OK)
                respond(['error' => 'Fout bij upload']);
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $allowed = ['jpg', 'jpeg', 'png', 'gif'];
            if (!in_array($ext, $allowed))
                respond(['error' => 'Alleen JPG, PNG of GIF toegestaan']);
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

            // Store only filename in DB
            respond([
                'success' => true,
                'filename' => $filename
            ]);
            break;

        // ------------------------
        // UPDATE USER (iban + qr_url)
        // ------------------------
        case 'update_user':
            require_login();
            $id = intval($input['id'] ?? 0);
            $iban = trim($input['iban'] ?? '');
            $qr_filename = trim($input['qr_filename'] ?? ''); // expect just filename from frontend
            if (!$id)
                respond(['error' => 'Geen geldig ID']);
            $stmt = $db->prepare("UPDATE users SET iban = ?, qr_url = ? WHERE id = ?");
            $stmt->bind_param('ssi', $iban, $qr_filename, $id);
            if (!$stmt->execute())
                respond(['error' => 'Kon gebruiker niet updaten']);
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
                    'owner_id' => (int) $row['owner_id'],
                    'owner_name' => $row['owner_name'],
                    'qr_user_id' => (int) $row['qr_user_id'],
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

            if (!$ownerId)
                respond(['error' => 'Owner is verplicht']);

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

            if (!$stmt->execute())
                respond(['error' => 'Kon mapping niet opslaan']);
            respond(['success' => true]);
            break;


        // ------------------------
        // GET SALE BY QR-ID
        // ------------------------
        case 'get_sale_by_qr':
            require_login();

            $qr_id = trim((string) ($input['qr_id'] ?? $_GET['qr_id'] ?? ''));
            if (!$qr_id) {
                respond(['error' => 'Geen QR-ID opgegeven']);
            }

            error_log("DEBUG get_sale_by_qr input: " . json_encode($input));
            error_log("DEBUG get_sale_by_qr qr_id = " . $qr_id);

            $stmt = $db->prepare('
                SELECT 
                    s.id, s.description, s.price, s.cost, s.image_url,
                    s.owner_user_id, u_owner.name AS owner_name,
                    s.cashier_user_id, u_cashier.name AS cashier_name,
                    s.is_pin, s.qr_id, s.sold_at, s.purchased_at, s.target_price
                FROM sales s
                LEFT JOIN users u_owner ON u_owner.id = s.owner_user_id
                LEFT JOIN users u_cashier ON u_cashier.id = s.cashier_user_id
                WHERE s.qr_id = ? AND s.deleted = 0
                LIMIT 1
            ');
            if (!$stmt) {
                respond(['error' => 'Databasefout bij voorbereiden query']);
            }

            $stmt->bind_param('s', $qr_id);
            if (!$stmt->execute()) {
                respond(['error' => 'Kon verkoop niet ophalen']);
            }

            $res = $stmt->get_result();
            $sale = $res->fetch_assoc();

            if (!$sale) {
                respond([
                    'error' => "Geen verkoop gevonden voor deze QR-code ($qr_id)",
                    'qr_id' => $qr_id
                ]);
            }

            // normaliseer
            $sale['id'] = (int) $sale['id'];
            $sale['owner_user_id'] = (int) $sale['owner_user_id'];
            $sale['cashier_user_id'] = isset($sale['cashier_user_id']) ? (int) $sale['cashier_user_id'] : null;
            $sale['is_pin'] = (int) $sale['is_pin'];

            if (!empty($sale['image_url'])) {
                $sale['image_url'] = uploads_url($sale['image_url']);
            } else {
                $sale['image_url'] = null;
            }

            respond(['success' => true, 'sale' => $sale]);
            break;
        default:
            respond(['error' => 'Ongeldige actie']);



    }


} catch (Throwable $e) {
    error_log($e->getMessage());
    respond(['error' => 'Serverfout: ' . $e->getMessage()]);
}
