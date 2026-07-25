import os
import tempfile
import urllib.request
import urllib.parse
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import speech_recognition as sr

import socket

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
app = Flask(__name__, static_folder=frontend_dir, static_url_path='')
CORS(app)  # Enable CORS for frontend integration

@app.route('/')
def index():
    return app.send_static_file('index.html')

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

@app.route('/api/get-ip', methods=['GET'])
def get_ip():
    return jsonify({'ip': get_local_ip()})

# Simple Google Translate function using free web endpoint (standard library only)
def translate_text_free(text, target_lang='en'):
    try:
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={target_lang}&dt=t&q={urllib.parse.quote(text)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            translated_text = "".join([sentence[0] for sentence in res_data[0] if sentence[0]])
            src_lang = res_data[2]
            return translated_text, src_lang
    except Exception as e:
        print(f"Translation error: {e}")
        return text, 'unknown'

@app.route('/api/translate-text', methods=['POST'])
def translate_text():
    data = request.json or {}
    text = data.get('text', '').strip()
    target_lang = data.get('target', 'en')  # 'hi' or 'en'
    
    if not text:
        return jsonify({'error': 'No text provided'}), 400
        
    try:
        translated_text, src_lang = translate_text_free(text, target_lang)
        return jsonify({
            'original_text': text,
            'translated_text': translated_text,
            'src_lang': src_lang,
            'dest_lang': target_lang
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/translate-media', methods=['POST'])
def translate_media():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
        
    target_lang = request.form.get('target', 'en')  # 'hi' or 'en'

    # Save uploaded WAV file to a temp file
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"upload_{os.urandom(8).hex()}.wav")
    
    try:
        file.save(temp_file_path)
        
        # Transcribe using SpeechRecognition
        recognizer = sr.Recognizer()
        with sr.AudioFile(temp_file_path) as source:
            audio_data = recognizer.record(source)
            
        print("Transcribing Marathi WAV using Google Speech Recognition...")
        marathi_text = recognizer.recognize_google(audio_data, language='mr-IN')
        print(f"Transcription complete: {marathi_text}")
        
        # Split into sentences or clauses for better readability
        clauses = [c.strip() for c in marathi_text.split(' आणि ') if c.strip()] # split by 'and' in Marathi if long
        if len(clauses) <= 1:
            clauses = [marathi_text]
            
        segments = []
        for clause in clauses:
            trans_text, _ = translate_text_free(clause, target_lang)
            segments.append({
                'marathi': clause,
                'translated': trans_text
            })
            
        return jsonify({
            'full_transcript': marathi_text,
            'segments': segments
        })
        
    except sr.UnknownValueError:
        return jsonify({'error': 'Speech Recognition could not understand the audio. Make sure it contains clear Marathi speech.'}), 400
    except sr.RequestError as e:
        return jsonify({'error': f'Speech Recognition API error: {e}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Cleanup temp file
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

if __name__ == '__main__':
    # Run on dynamic port for deployment (Render assigns PORT env var)
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
