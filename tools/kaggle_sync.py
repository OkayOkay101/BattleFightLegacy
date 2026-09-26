"""
BattleFight Kaggle Sync Helper
ใช้บน Kaggle Notebook สำหรับ:
1. นำเข้าข้อมูลการเล่นจากเครื่อง Local เข้ามารวม (Import & Merge Matches)
2. สั่ง Train สมองกลรุ่นใหม่ด้วยพลังการประมวลผลของ Kaggle
3. บันทึกผลลัพธ์เป็น kaggle_sync_bundle.json ส่งกลับไปให้เครื่อง Local ในคลิกเดียว
"""

import os
import sys
import json
import glob

DATA_DIR = '/kaggle/working/taro-engine/training-data'
POLICIES_DIR = os.path.join(DATA_DIR, 'policies')
NEURAL_DIR = os.path.join(DATA_DIR, 'neural')
MATCHES_FILE = os.path.join(DATA_DIR, 'matches.jsonl')
REGISTRY_FILE = os.path.join(DATA_DIR, 'registry.json')

os.makedirs(POLICIES_DIR, exist_ok=True)
os.makedirs(NEURAL_DIR, exist_ok=True)

def import_local_bundle(bundle_path):
    """นำเข้า Bundle จากเครื่อง Local มารวมกับ Kaggle"""
    if not os.path.exists(bundle_path):
        print(f"❌ ไม่พบไฟล์ {bundle_path}")
        return
    
    with open(bundle_path, 'r', encoding='utf-8') as f:
        bundle = json.load(f)
    
    # 1. นำเข้าโมเดล
    policies = bundle.get('policies', {})
    for filename, content in policies.items():
        dst = os.path.join(POLICIES_DIR, filename)
        with open(dst, 'w', encoding='utf-8') as f_out:
            f_out.write(content if isinstance(content, str) else json.dumps(content))
    print(f"✅ นำเข้า Policies แล้ว: {len(policies)} ไฟล์")

    # 2. นำเข้า matches
    matches = bundle.get('matches', '')
    if matches:
        with open(MATCHES_FILE, 'a', encoding='utf-8') as f_out:
            if not matches.endswith('\n'):
                matches += '\n'
            f_out.write(matches)
        print(f"✅ รวมประวัติแมตช์เข้าด้วยกันแล้ว: {bundle.get('matchesCount', 0)} แมตช์")

    # 3. นำเข้า registry
    reg = bundle.get('registry')
    if reg:
        with open(REGISTRY_FILE, 'w', encoding='utf-8') as f_out:
            f_out.write(reg if isinstance(reg, str) else json.dumps(reg))
        print("✅ อัปเดต Registry เรียบร้อย")

def export_kaggle_bundle(output_path='/kaggle/working/kaggle_sync_bundle.json'):
    """แพ็กผลการเทรนบน Kaggle ส่งกลับไปให้ Local"""
    policies = {}
    if os.path.exists(POLICIES_DIR):
        for f in os.listdir(POLICIES_DIR):
            if f.endswith('.json'):
                with open(os.path.join(POLICIES_DIR, f), 'r', encoding='utf-8') as pf:
                    policies[f] = pf.read()

    matches_content = ''
    if os.path.exists(MATCHES_FILE):
        with open(MATCHES_FILE, 'r', encoding='utf-8') as mf:
            matches_content = mf.read()

    reg_content = None
    if os.path.exists(REGISTRY_FILE):
        with open(REGISTRY_FILE, 'r', encoding='utf-8') as rf:
            reg_content = rf.read()

    bundle = {
        'ok': True,
        'source': 'kaggle',
        'policies': policies,
        'matches': matches_content,
        'registry': reg_content
    }

    with open(output_path, 'w', encoding='utf-8') as f_out:
        json.dump(bundle, f_out)
    
    print(f"🎉 สร้างไฟล์ Sync Bundle สำเร็จ: {output_path}")
    print("👉 กด Download ไฟล์นี้จากแถบ Output ด้านขวาของ Kaggle แล้วไปกด '📥 นำเข้าจาก Kaggle' บน Desktop App ได้เลย!")

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'export':
        export_kaggle_bundle()
    elif len(sys.argv) > 2 and sys.argv[1] == 'import':
        import_local_bundle(sys.argv[2])
    else:
        print("วิธีใช้: python kaggle_sync.py [import <bundle_path> | export]")
