<?php
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/chat.env.php';
require __DIR__ . '/config.php';

// DB connectie
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($conn->connect_error) {
    echo json_encode(['error' => true, 'message' => 'Database connectie mislukt: ' . $conn->connect_error], JSON_UNESCAPED_UNICODE);
    exit;
}

date_default_timezone_set('Europe/Amsterdam');
$now = date('H:i:s');

function logError($message) {
    $logfile = __DIR__ . '/chat.log';
    $date = date('Y-m-d H:i:s');
    file_put_contents($logfile, "[$date] $message\n", FILE_APPEND);
}

try {
    // POST-body uitlezen
    $request = json_decode(file_get_contents('php://input'), true);
    $action = $request['action'] ?? '';
    $userName = $request['user_name'] ?? 'teamlid';
    $userId   = $request['user_id'] ?? null;

    if ($action !== 'motivation') {
        echo json_encode(['error' => true, 'message' => 'Ongeldige actie'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Sales van vandaag
    $stmt = $conn->prepare("SELECT description, price, owner_user_id FROM sales WHERE DATE(sold_at) = CURDATE() AND TIME(sold_at) <= ? AND deleted = 0");
    $stmt->bind_param("s", $now);
    $stmt->execute();
    $result = $stmt->get_result();
    $sales_today = [];
    $total_sales = 0;
    while ($row = $result->fetch_assoc()) {
        $sales_today[] = [
            'item' => $row['description'],
            'amount' => (float)$row['price'],
            'owner_user_id' => (int)$row['owner_user_id']
        ];
        $total_sales += (float)$row['price'];
    }
    $stmt->close();

    // Sales zelfde tijd vorige week
    $stmt_prev = $conn->prepare("SELECT SUM(price) as prev_total FROM sales WHERE DATE(sold_at) = DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND TIME(sold_at) <= ? AND deleted = 0");
    $stmt_prev->bind_param("s", $now);
    $stmt_prev->execute();
    $last_week_total = (float)($stmt_prev->get_result()->fetch_assoc()['prev_total'] ?? 0);
    $stmt_prev->close();
    $conn->close();

    // OpenAI prompt met dynamische gebruiker
    $prompt = [
        [
            'role' => 'system',
            'content' => 'Je bent een positieve assistent voor een kleine winkel. Gebruik interne categorisatie van producten om trends te herkennen, maar toon de categorisatie nooit in je antwoord. Geef alleen een kort, motiverend bericht zoals: "Hey dat is een stuk beter dan vorige week! Vooral de posters doen het goed!"'
        ],
        [
            'role' => 'user',
            'content' => json_encode([
                'name' => $userName,
                'user_id' => $userId,
                'total_sales' => $total_sales,
                'sales_today' => $sales_today,
                'last_week_same_time' => $last_week_total
            ], JSON_UNESCAPED_UNICODE)
        ]
    ];

    $payload = [
        'model' => 'gpt-4o-mini',
        'messages' => $prompt,
        'max_tokens' => 150
    ];

    $ch = curl_init("https://api.openai.com/v1/chat/completions");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/json",
            "Authorization: Bearer " . OPENAI_API_KEY
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE)
    ]);

    $response = curl_exec($ch);
    if (curl_errno($ch)) throw new Exception("Curl error: " . curl_error($ch));
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = json_decode($response, true);
    if (!$json) throw new Exception("Response geen geldige JSON: " . substr($response, 0, 200));
    if ($httpcode >= 400) throw new Exception("OpenAI API error ($httpcode): " . ($json['error']['message'] ?? 'Onbekende fout'));

    // Retourneer alleen het bericht
    $message = $json['choices'][0]['message']['content'] ?? '';
    echo json_encode(['message' => $message], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    logError("Error: " . $e->getMessage());
    echo json_encode(['error' => true, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
