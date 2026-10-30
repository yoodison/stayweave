#!/usr/bin/env python3
"""Assemble a picture-locked cut, recorded narration and aligned SRT. No network AI."""
import argparse
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def run(args):
    return subprocess.run([str(x) for x in args], check=True, text=True, capture_output=True)

def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]).stdout)

def parse_srt(path, duration):
    cues = []
    stamp = r'(\d{2}):(\d{2}):(\d{2})[,.](\d{3})'
    def seconds(groups):
        h, m, s, ms = map(int, groups)
        if m > 59 or s > 59:
            raise ValueError('Invalid SRT timestamp')
        return h*3600 + m*60 + s + ms/1000
    for block in re.split(r'\n\s*\n', path.read_text(encoding='utf-8-sig').strip()):
        lines = block.splitlines()
        if len(lines) < 3:
            raise ValueError('Each SRT cue needs an index, time range and text')
        match = re.fullmatch(stamp + r' --> ' + stamp, lines[1].strip())
        if not match:
            raise ValueError('Invalid SRT time range')
        start, end = seconds(match.groups()[:4]), seconds(match.groups()[4:])
        if start < 0 or end <= start or end > duration + .04 or (cues and start < cues[-1]['end']):
            raise ValueError('Captions overlap, reverse, or extend past the video')
        cues.append({'start': start, 'end': end, 'text': '\n'.join(lines[2:])})
    if not cues:
        raise ValueError('An aligned SRT is required')
    return cues

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--picture', type=Path, required=True)
    parser.add_argument('--voice', type=Path, required=True)
    parser.add_argument('--srt', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--test-only', action='store_true')
    args = parser.parse_args()
    for tool in ['ffmpeg', 'ffprobe']:
        if not shutil.which(tool):
            parser.error(f'{tool} is required')
    args.output = args.output.resolve()
    outputs = [args.output, args.output.with_suffix('.srt'), args.output.with_suffix('.qa.json')]
    if any(p.exists() for p in outputs):
        parser.error('Output exists; choose a fresh output name')
    for path in [args.picture, args.voice, args.srt]:
        if not path.is_file():
            parser.error(f'Missing input: {path}')
    picture, voice = probe(args.picture), probe(args.voice)
    if not any(s['codec_type'] == 'video' for s in picture['streams']):
        parser.error('Picture input has no video')
    if not any(s['codec_type'] == 'audio' for s in voice['streams']):
        parser.error('Voice input has no audio')
    duration = float(picture['format']['duration'])
    frames = math.ceil(duration*30)
    if duration <= 0 or frames >= 5400:
        parser.error('Final video must be strictly under 180 seconds')
    if float(voice['format']['duration']) > duration + .04:
        parser.error('Voice is longer than picture; revise the picture lock or narration')
    captions = parse_srt(args.srt, duration)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    public = ROOT/'public'
    public.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='assembly-', dir=public) as folder:
        folder = Path(folder)
        picture_copy = folder/('picture'+args.picture.suffix)
        shutil.copyfile(args.picture, picture_copy)
        measured = run(['ffmpeg', '-hide_banner', '-i', args.voice, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr
        match = re.search(r'\{\s*"input_i"[\s\S]+?\}', measured)
        if not match:
            raise ValueError('Could not measure narration loudness')
        loudness = json.loads(match.group())
        if any(not math.isfinite(float(loudness[key])) for key in ['input_i','input_tp','input_lra','input_thresh','target_offset']):
            raise ValueError('Narration is silent or cannot be normalized')
        settings = ':'.join(f'{out}={loudness[key]}' for out,key in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
        voice_copy = folder/'voice.wav'
        run(['ffmpeg', '-hide_banner', '-i', args.voice, '-vn', '-af', f'loudnorm=I=-16:TP=-1.5:LRA=11:{settings}:linear=true,apad', '-t', duration, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', voice_copy])
        props = {'picture': str(picture_copy.relative_to(public)), 'narration': str(voice_copy.relative_to(public)), 'captions': captions, 'durationFrames': frames, 'testOnly': args.test_only}
        props_path = folder/'props.json'
        props_path.write_text(json.dumps(props), encoding='utf-8')
        subprocess.run([str(ROOT/'node_modules/.bin/remotion'), 'render', str(ROOT/'src/index.jsx'), 'StayWeaveFinal', str(args.output), '--props', str(props_path), '--codec', 'h264', '--concurrency', '2'], cwd=ROOT, check=True)
    result = probe(args.output)
    stream = next(s for s in result['streams'] if s['codec_type'] == 'video')
    if float(result['format']['duration']) >= 180 or (stream['width'],stream['height']) != (1920,1080) or stream['avg_frame_rate'] != '30/1' or not any(s['codec_type'] == 'audio' for s in result['streams']):
        raise ValueError('Rendered output failed format validation')
    shutil.copyfile(args.srt, outputs[1])
    outputs[2].write_text(json.dumps({'testOnly': args.test_only, 'durationSeconds': float(result['format']['duration']), 'video': stream, 'captionCount': len(captions), 'narrationInputMeasurement': loudness, 'note': 'Format checks only. Watch full output and proofread captions before publication.'}, indent=2), encoding='utf-8')
    print(f'Created {args.output}; aligned SRT and QA report saved alongside it.')

if __name__ == '__main__':
    main()
