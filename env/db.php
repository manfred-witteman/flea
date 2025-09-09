<?php
// env/db.php
declare(strict_types=1);

// Zorg dat config geladen is
require_once __DIR__ . '/config.php';

function db(): mysqli {
    $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if ($mysqli->connect_errno) {
        throw new Exception('Database connectie mislukt: ' . $mysqli->connect_error);
    }
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}