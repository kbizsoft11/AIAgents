<?php
/**
 * Gmail AI Email Generator - Backend
 * Calls Qwen API to generate professional email responses
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuration
$QWEN_API_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
$QWEN_API_KEY = 'Bearer YOUR_QWEN_API_KEY_HERE'; // Replace with actual API key

// Get request data
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid request body']);
    exit;
}

$subject = isset($input['subject']) ? trim($input['subject']) : '';
$body = isset($input['body']) ? trim($input['body']) : '';
$tone = isset($input['tone']) ? $input['tone'] : 'professional'; // professional, formal, casual

if (empty($subject) && empty($body)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Subject or body is required']);
    exit;
}

// Build the prompt based on tone
$toneInstructions = [
    'professional' => 'Write a professional and well-structured email response.',
    'formal' => 'Write a formal and courteous email response with proper etiquette.',
    'casual' => 'Write a friendly and casual email response while maintaining professionalism.'
];

$toneText = $toneInstructions[$tone] ?? $toneInstructions['professional'];

// Create the prompt for Qwen
$prompt = "You are an expert email writer. {$toneText}\n\n";

if (!empty($subject)) {
    $prompt .= "Email Subject: {$subject}\n\n";
}

if (!empty($body)) {
    $prompt .= "Current Email Draft:\n{$body}\n\n";
}

$prompt .= "Please improve and rewrite this email to be more professional, clear, and impactful. ";
$prompt .= "Only provide the improved email body text, without any additional explanation or subject line.";

// Prepare Qwen API request
$qwenPayload = [
    'model' => 'qwen3.6-flash',
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt
        ]
    ],
    'stream' => false,
    'enable_thinking' => false
];

// Call Qwen API
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $QWEN_API_URL,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        "Authorization: {$QWEN_API_KEY}"
    ],
    CURLOPT_POSTFIELDS => json_encode($qwenPayload)
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Handle curl errors
if ($curlError) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => "API request failed: {$curlError}"
    ]);
    exit;
}

// Parse response
$qwenResponse = json_decode($response, true);

// Handle API errors
if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo json_encode([
        'success' => false,
        'error' => $qwenResponse['error']['message'] ?? 'Failed to generate email',
        'details' => $qwenResponse['error'] ?? null
    ]);
    exit;
}

// Extract the generated email from response
if (isset($qwenResponse['choices'][0]['message']['content'])) {
    $generatedEmail = $qwenResponse['choices'][0]['message']['content'];
    
    echo json_encode([
        'success' => true,
        'email' => $generatedEmail,
        'tokens_used' => $qwenResponse['usage']['total_tokens'] ?? null,
        'model' => $qwenResponse['model'] ?? 'qwen3.6-flash'
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Invalid response format from AI API',
        'response' => $qwenResponse
    ]);
}
?>
