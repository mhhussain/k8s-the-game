"""Generate original, short offline UI tones; no sampled or licensed recordings."""
import math, struct, wave
from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'mobile/assets/audio'
root.mkdir(parents=True, exist_ok=True)
for name, notes in {'build': [660, 880], 'reward': [523.25, 659.25, 783.99], 'upgrade': [523.25, 783.99, 1046.5], 'incident': [392, 329.63]}.items():
    frames = []
    for freq in notes:
        for i in range(4410):
            t = i / 44100
            envelope = min(1, t / .008) * max(0, 1 - t/.1) ** 2
            frames.append(struct.pack('<h', int(6500 * envelope * (math.sin(2*math.pi*freq*t) + .18*math.sin(4*math.pi*freq*t)))))
    with wave.open(str(root / (name + '.wav')), 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(44100); out.writeframes(b''.join(frames))
