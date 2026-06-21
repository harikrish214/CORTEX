with open(r"c:\Users\Bhuvan M H\Desktop\dna\backend\app\database.py", "r", encoding="utf-8") as f:
    content = f.read()

lines = content.splitlines()
start = -1
for i, line in enumerate(lines):
    if "Populate Officers" in line:
        start = i
        break

if start != -1:
    for line in lines[start:start+40]:
        print(line)
