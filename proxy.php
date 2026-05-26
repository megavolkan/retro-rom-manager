<?php
/**
 * RETRO ROM MANAGER - LOKAL GÜVENLİ CORS PROKSİSİ (proxy.php)
 * 
 * Bu dosya, uygulamanızı Laravel Herd gibi yerel bir PHP/Nginx sunucusu üzerinde
 * çalıştırırken tarayıcının CORS (Same-Origin) engellerine takılmasını önler.
 * İstekleri yerel makinenizden (Server-Side) doğrudan ScreenScraper API'sine
 * göndererek tüm genel proxy engellerini, Cloudflare bloklarını ve hız sınırlarını aşar.
 */

// CORS Başlıklarını Tanımla (Same-Origin olduğu için normalde gerekmez ama yedek güvenlik olarak)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// URL Parametresini Al
$url = $_GET['url'] ?? '';
if (empty($url)) {
    http_response_code(400);
    echo json_encode(["error" => "URL parametresi eksik!"]);
    exit;
}

// Güvenlik Kontrolü: Sadece ScreenScraper ve medya sunucularına izin ver
$allowedDomains = [
    'screenscraper.fr', 
    'www.screenscraper.fr', 
    'api.screenscraper.fr',
    'media.screenscraper.fr'
];
$parsedUrl = parse_url($url);
$host = $parsedUrl['host'] ?? '';

$isAllowed = false;
foreach ($allowedDomains as $domain) {
    if ($host === $domain || str_ends_with($host, '.' . $domain)) {
        $isAllowed = true;
        break;
    }
}

// Eğer hedef URL izinli bir alan adı değilse engelle
if (!$isAllowed) {
    http_response_code(403);
    echo json_encode(["error" => "Güvenlik Engeli: Yalnızca ScreenScraper alan adlarına erişim izni vardır."]);
    exit;
}

// İstek Başlat (cURL ile sunucu seviyesinde bağlantı)
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'retromgr/1.5.3');
curl_setopt($ch, CURLOPT_TIMEOUT, 15); // 15 saniye zaman aşımı

$response = curl_exec($ch);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(["error" => "Sunucu bağlantı hatası! Hedef sunucuya erişilemedi."]);
    exit;
}

// Gelen yanıtı olduğu gibi istemciye aktar
http_response_code($httpCode);
header("Content-Type: " . $contentType);
echo $response;
