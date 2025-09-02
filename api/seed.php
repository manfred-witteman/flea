<?php
// api/seed.php
// Eenvoudige seed om 3 gebruikers toe te voegen. Verwijder dit bestand in productie.
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

$db = db();
$users = [
  ['name' => 'Alice', 'email' => 'alice@example.com', 'password' => 'password'],
  ['name' => 'Bob', 'email' => 'bob@example.com', 'password' => 'password'],
  ['name' => 'Carla', 'email' => 'carla@example.com', 'password' => 'password'],
];

foreach ($users as $u) {
  $stmt = $db->prepare('INSERT IGNORE INTO users (name, email, password_hash, active, created_at) VALUES (?, ?, ?, 1, NOW())');
  $hash = password_hash($u['password'], PASSWORD_BCRYPT);
  $stmt->bind_param('sss', $u['name'], $u['email'], $hash);
  $stmt->execute();
}

echo "Users seeded.\n";
