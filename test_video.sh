#!/bin/bash

# Test script to check if a video can be streamed properly
# Usage: ./test_video.sh <video_uuid>

VIDEO_UUID=${1:-"df796489-d794-4466-889b-3868aa5dcd83"}
BASE_URL="http://localhost:42069"

echo "Testing video streaming for UUID: $VIDEO_UUID"
echo "=========================================="

# Test 1: Check if the stream endpoint responds
echo "1. Testing stream endpoint response..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/stream/$VIDEO_UUID")
echo "HTTP Status Code: $RESPONSE"

if [ "$RESPONSE" = "200" ]; then
    echo "✅ Stream endpoint is responding"
    
    # Test 2: Check content type
    echo ""
    echo "2. Checking content type..."
    CONTENT_TYPE=$(curl -s -I "$BASE_URL/api/stream/$VIDEO_UUID" | grep -i "content-type" | cut -d' ' -f2- | tr -d '\r')
    echo "Content-Type: $CONTENT_TYPE"
    
    # Test 3: Check content length
    echo ""
    echo "3. Checking content length..."
    CONTENT_LENGTH=$(curl -s -I "$BASE_URL/api/stream/$VIDEO_UUID" | grep -i "content-length" | cut -d' ' -f2- | tr -d '\r')
    echo "Content-Length: $CONTENT_LENGTH"
    
    # Test 4: Download first 1KB to check if data is valid
    echo ""
    echo "4. Testing partial download (first 1KB)..."
    curl -s -r 0-1023 "$BASE_URL/api/stream/$VIDEO_UUID" -o "/tmp/test_video_${VIDEO_UUID}_sample.bin"
    
    if [ -f "/tmp/test_video_${VIDEO_UUID}_sample.bin" ]; then
        SAMPLE_SIZE=$(wc -c < "/tmp/test_video_${VIDEO_UUID}_sample.bin")
        echo "Downloaded sample size: $SAMPLE_SIZE bytes"
        
        # Check if it looks like a video file (MP4 signature)
        HEX_HEADER=$(xxd -l 16 "/tmp/test_video_${VIDEO_UUID}_sample.bin" | head -1)
        echo "File header (hex): $HEX_HEADER"
        
        # Clean up
        rm "/tmp/test_video_${VIDEO_UUID}_sample.bin"
    else
        echo "❌ Failed to download sample"
    fi
    
else
    echo "❌ Stream endpoint failed with status: $RESPONSE"
    
    # Get error details
    echo ""
    echo "Error details:"
    curl -s "$BASE_URL/api/stream/$VIDEO_UUID"
fi

echo ""
echo "=========================================="
echo "Test completed for UUID: $VIDEO_UUID"

# Also test a working video for comparison
echo ""
echo "Comparing with a working video..."
WORKING_UUID="50450043-635f-47c8-a436-c8ac459c7986"
echo "Testing working video UUID: $WORKING_UUID"

WORKING_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/stream/$WORKING_UUID")
echo "Working video HTTP Status: $WORKING_RESPONSE"

if [ "$WORKING_RESPONSE" = "200" ]; then
    WORKING_CONTENT_LENGTH=$(curl -s -I "$BASE_URL/api/stream/$WORKING_UUID" | grep -i "content-length" | cut -d' ' -f2- | tr -d '\r')
    echo "Working video Content-Length: $WORKING_CONTENT_LENGTH"
else
    echo "❌ Working video also failed: $WORKING_RESPONSE"
fi