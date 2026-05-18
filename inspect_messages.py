import json, os
path = os.path.join('backend','data','coordinatorGraphStore.json')
print('exists', os.path.exists(path))
print('path', path)
with open(path, 'r', encoding='utf8') as f:
    data = json.load(f)
msgs = data.get('messages', [])
print('messages count', len(msgs))
print(json.dumps(msgs[:10], indent=2))
