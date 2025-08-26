import json
import re

# serials.csv의 데이터를 기반으로 장비 정보 생성
equipment_data = []

# CSV 데이터 (수동으로 입력)
csv_lines = [
    '1,(벤젠) MP-Σ30KNⅡ,770654',
    '2,(벤젠) MP-Σ30KNⅡ,770655',
    '3,(벤젠) MP-Σ30KNⅡ,770658',
    '4,(벤젠) MP-Σ30KNⅡ,770660',
    '5,(벤젠) MP-Σ30KNⅡ,141411',
    '6,(벤젠) MP-Σ30KNⅡ,141412',
    '7,(벤젠) MP-Σ30KNⅡ,850746',
    '8,(SO2) Serinus50i,17-1733',
    '9,(SO2) Serinus50i,17-1906',
    '10,(SO2) Serinus50i,17-1912',
    '11,(SO2) Serinus50i,18-0318',
    '12,(SO2) Serinus50i,17-1798',
    '13,(SO2) Serinus50i,17-1903',
    '14,(SO2) Serinus50i,17-0866',
    '15,(PM-2.5) PMS-204,1501478',
    '16,(PM-2.5) PMS-204,1501479',
    '17,(PM-2.5) PMS-204,1501481',
    '18,(PM-2.5) PMS-204,1501489',
    '19,(PM-2.5) PMS-204,1501490',
    '20,(PM-2.5) PMS-204,1501504'
]

for line in csv_lines:
    parts = line.split(',')
    if len(parts) >= 3:
        category_info = parts[1].strip()
        serial_number = parts[2].strip()
        
        # (측정항목) 품목계열 형태에서 추출
        match = re.match(r'\((.*?)\)\s*(.*)', category_info)
        
        if match:
            measurement_item = match.group(1).strip()
            product_series = match.group(2).strip()
            
            equipment = {
                'serial': serial_number,
                'measurement_item': measurement_item,
                'product_series': product_series,
                'category': category_info,
                'currentLocation': '본사 창고',
                'status': '대기 중',
                'lastMovement': '',
                'uptimeEstimatePct': 0,
                'repairCount': 0,
                'totalRepairCost': 0
            }
            
            equipment_data.append(equipment)

# JSON 파일로 저장
with open('db/equipment_db_serials.json', 'w', encoding='utf-8') as f:
    json.dump(equipment_data, f, ensure_ascii=False, indent=2)

print(f'총 {len(equipment_data)}개의 장비 정보가 저장되었습니다.')
print('샘플 데이터:')
for i, eq in enumerate(equipment_data[:3]):
    print(f'{i+1}. {eq["serial"]} - {eq["measurement_item"]} / {eq["product_series"]}')
