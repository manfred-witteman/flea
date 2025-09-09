<?php
// api/db.php
function db(): mysqli {
  $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
  if ($mysqli->connect_errno) {
    http_response_code(500);
    echo json_encode(['error' => 'DB-verbinding mislukt']);
    exit;
  }
  $mysqli->set_charset('utf8mb4');
  return $mysqli;
}
