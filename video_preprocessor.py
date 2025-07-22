#!/usr/bin/env python3
"""
Video Preprocessor - Makes stubborn videos submit to OpenCV's desires! 🔥
Automatically converts problematic codecs to OpenCV-friendly formats
"""

import cv2
import subprocess
import os
import tempfile
import shutil
from pathlib import Path

class VideoPreprocessor:
    def __init__(self):
        self.supported_by_opencv = [
            'h264', 'h265', 'vp8', 'vp9', 'mjpeg', 'mpeg4'
        ]
        self.problematic_codecs = [
            'av1', 'hevc'  # Add more as we discover them
        ]
    
    def get_video_codec(self, video_path):
        """Get the codec of a video file"""
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', '-select_streams', 'v:0',
                '-show_entries', 'stream=codec_name', '-of', 'csv=p=0',
                video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip()
            return None
        except Exception:
            return None
    
    def test_opencv_compatibility(self, video_path):
        """Test if OpenCV can read the video"""
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return False
            
            ret, frame = cap.read()
            cap.release()
            return ret
        except Exception:
            return False
    
    def convert_video(self, input_path, output_path, target_codec='libx264'):
        """Convert video to OpenCV-compatible format"""
        try:
            cmd = [
                'ffmpeg', '-y', '-i', input_path,
                '-c:v', target_codec,
                '-c:a', 'aac',
                '-preset', 'fast',
                '-pix_fmt', 'yuv420p',  # Force 8-bit color
                output_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0 and os.path.exists(output_path):
                return True
            else:
                print(f"Conversion failed: {result.stderr}")
                return False
        except Exception as e:
            print(f"Conversion error: {e}")
            return False
    
    def preprocess_video(self, video_path, force_convert=False):
        """
        Preprocess video for OpenCV compatibility
        Returns: (processed_video_path, was_converted)
        """
        # First check if OpenCV can already handle it
        if not force_convert and self.test_opencv_compatibility(video_path):
            return video_path, False
        
        # Get codec info
        codec = self.get_video_codec(video_path)
        print(f"🎬 Video codec detected: {codec}")
        
        # If it's a problematic codec or OpenCV can't read it, convert
        if codec in self.problematic_codecs or not self.test_opencv_compatibility(video_path):
            print(f"🔄 Converting {codec} video for OpenCV compatibility...")
            
            # Create temp file for converted video
            temp_dir = tempfile.mkdtemp()
            temp_output = os.path.join(temp_dir, f"converted_{Path(video_path).stem}.mp4")
            
            if self.convert_video(video_path, temp_output):
                print(f"✅ Successfully converted to H.264!")
                return temp_output, True
            else:
                print(f"❌ Conversion failed!")
                return video_path, False
        
        return video_path, False

def preprocess_for_comfyui(video_path):
    """
    Main function to preprocess videos for ComfyUI
    Returns the path to a video that OpenCV can definitely read
    """
    preprocessor = VideoPreprocessor()
    processed_path, was_converted = preprocessor.preprocess_video(video_path)
    
    if was_converted:
        print(f"🎉 Video preprocessed successfully: {processed_path}")
    else:
        print(f"✅ Video already compatible: {processed_path}")
    
    return processed_path, was_converted

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python video_preprocessor.py <video_file>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    processed_path, was_converted = preprocess_for_comfyui(video_path)
    print(f"Result: {processed_path} (converted: {was_converted})")