#!/usr/bin/env python3
"""
Video Codec Test Script - Let's make this AV1 video submit to our will! 🔥
Tests multiple approaches to handle problematic AV1 videos
"""

import cv2
import subprocess
import os
import sys
from pathlib import Path
import tempfile

def test_system_ffmpeg(video_path):
    """Test if system ffmpeg can handle the video"""
    print("🔥 Testing system ffmpeg probe...")
    try:
        result = subprocess.run([
            'ffmpeg', '-i', video_path, '-f', 'null', '-'
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print("✅ System ffmpeg can read the video!")
            return True
        else:
            print(f"❌ System ffmpeg failed: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ System ffmpeg test failed: {e}")
        return False

def test_opencv_direct(video_path):
    """Test OpenCV direct reading"""
    print("🔥 Testing OpenCV direct reading...")
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print("❌ OpenCV couldn't open the video")
            return False
        
        # Try to read first frame
        ret, frame = cap.read()
        if ret:
            print("✅ OpenCV can read frames!")
            print(f"   Frame shape: {frame.shape}")
            print(f"   FPS: {cap.get(cv2.CAP_PROP_FPS)}")
            print(f"   Frame count: {cap.get(cv2.CAP_PROP_FRAME_COUNT)}")
            cap.release()
            return True
        else:
            print("❌ OpenCV couldn't read frames")
            cap.release()
            return False
    except Exception as e:
        print(f"❌ OpenCV direct test failed: {e}")
        return False

def test_opencv_with_backend(video_path, backend_name, backend_id):
    """Test OpenCV with specific backend"""
    print(f"🔥 Testing OpenCV with {backend_name} backend...")
    try:
        cap = cv2.VideoCapture(video_path, backend_id)
        if not cap.isOpened():
            print(f"❌ OpenCV couldn't open with {backend_name}")
            return False
        
        ret, frame = cap.read()
        if ret:
            print(f"✅ {backend_name} backend works!")
            cap.release()
            return True
        else:
            print(f"❌ {backend_name} backend couldn't read frames")
            cap.release()
            return False
    except Exception as e:
        print(f"❌ {backend_name} backend test failed: {e}")
        return False

def convert_with_ffmpeg(video_path, output_path, codec='libx264'):
    """Convert video using system ffmpeg"""
    print(f"🔥 Converting with ffmpeg to {codec}...")
    try:
        cmd = [
            'ffmpeg', '-y', '-i', video_path,
            '-c:v', codec,
            '-c:a', 'aac',
            '-preset', 'fast',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0 and os.path.exists(output_path):
            print(f"✅ Successfully converted to {codec}!")
            return output_path
        else:
            print(f"❌ Conversion failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        return None

def test_video_info(video_path):
    """Get detailed video information"""
    print("🔥 Getting video info with ffprobe...")
    try:
        cmd = [
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            import json
            info = json.loads(result.stdout)
            
            print("📊 Video Information:")
            for stream in info.get('streams', []):
                if stream.get('codec_type') == 'video':
                    print(f"   Codec: {stream.get('codec_name')}")
                    print(f"   Profile: {stream.get('profile')}")
                    print(f"   Level: {stream.get('level')}")
                    print(f"   Pixel Format: {stream.get('pix_fmt')}")
                    print(f"   Resolution: {stream.get('width')}x{stream.get('height')}")
                    print(f"   FPS: {stream.get('r_frame_rate')}")
            
            return info
        else:
            print(f"❌ ffprobe failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"❌ Video info failed: {e}")
        return None

def main():
    if len(sys.argv) != 2:
        print("Usage: python video_codec_test.py <video_file>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    if not os.path.exists(video_path):
        print(f"❌ Video file not found: {video_path}")
        sys.exit(1)
    
    print(f"🎬 Testing video: {video_path}")
    print("=" * 60)
    
    # Get video info first
    video_info = test_video_info(video_path)
    
    print("\n" + "=" * 60)
    
    # Test system ffmpeg
    system_ffmpeg_works = test_system_ffmpeg(video_path)
    
    print("\n" + "=" * 60)
    
    # Test OpenCV direct
    opencv_direct_works = test_opencv_direct(video_path)
    
    print("\n" + "=" * 60)
    
    # Test different OpenCV backends
    backends_to_test = [
        ('FFMPEG', cv2.CAP_FFMPEG),
        ('V4L2', cv2.CAP_V4L2),
        ('GSTREAMER', cv2.CAP_GSTREAMER),
    ]
    
    working_backends = []
    for name, backend_id in backends_to_test:
        try:
            if test_opencv_with_backend(video_path, name, backend_id):
                working_backends.append(name)
        except:
            pass
        print()
    
    print("=" * 60)
    
    # If nothing works, try conversions
    if not opencv_direct_works and not working_backends:
        print("🔥 Trying conversions as last resort...")
        
        temp_dir = tempfile.mkdtemp()
        conversions_to_try = [
            ('libx264', 'h264'),
            ('libx265', 'h265'),
            ('libvpx-vp9', 'vp9'),
            ('copy', 'copy')  # Just remux
        ]
        
        for codec, name in conversions_to_try:
            output_path = os.path.join(temp_dir, f"converted_{name}.mp4")
            converted = convert_with_ffmpeg(video_path, output_path, codec)
            
            if converted:
                print(f"Testing converted {name} file...")
                if test_opencv_direct(converted):
                    print(f"🎉 SUCCESS! {name} conversion works with OpenCV!")
                    print(f"   Converted file: {converted}")
                    break
                else:
                    os.remove(converted)
            print()
    
    print("=" * 60)
    print("🏁 Test Summary:")
    print(f"   System ffmpeg: {'✅' if system_ffmpeg_works else '❌'}")
    print(f"   OpenCV direct: {'✅' if opencv_direct_works else '❌'}")
    print(f"   Working backends: {', '.join(working_backends) if working_backends else 'None'}")

if __name__ == "__main__":
    main()