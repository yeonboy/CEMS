import json
import csv
import re

def load_equipment_db():
    """equipment_db_serials.json에서 장비 정보를 로드합니다."""
    try:
        with open('db/equipment_db_serials.json', 'r', encoding='utf-8') as f:
            equipment_data = json.load(f)
        
        # 일련번호를 키로 하는 딕셔너리 생성
        equipment_dict = {}
        for equipment in equipment_data:
            equipment_dict[equipment['serial']] = equipment
        
        print(f"장비 데이터베이스 로드 완료: {len(equipment_dict)}개")
        return equipment_dict
    except Exception as e:
        print(f"장비 데이터베이스 로드 오류: {e}")
        return {}

def find_missing_equipment():
    """수리내역logs.csv에서 사용되는 모든 일련번호를 추출하고 누락된 장비를 찾습니다."""
    
    # 장비 데이터베이스 로드
    equipment_dict = load_equipment_db()
    if not equipment_dict:
        return
    
    # 수리내역에서 사용되는 모든 일련번호 추출
    repair_serials = set()
    missing_serials = []
    
    try:
        with open('청명장비 엑셀/수리내역logs.csv', 'r', encoding='utf-8') as file:
            csv_reader = csv.reader(file)
            
            for row_num, row in enumerate(csv_reader):
                # 헤더 행과 빈 행 건너뛰기
                if row_num < 2 or not row or len(row) < 10:
                    continue
                
                try:
                    serial_number = row[8].strip() if len(row) > 8 else ""
                    product_series = row[5].strip() if len(row) > 5 else ""
                    
                    # 일련번호가 있고 "21"이 아닌 경우
                    if serial_number and serial_number != "21":
                        repair_serials.add(serial_number)
                        
                        # 장비 데이터베이스에 없는 경우
                        if serial_number not in equipment_dict:
                            missing_serials.append({
                                'serial': serial_number,
                                'product_series': product_series,
                                'row': row_num + 1
                            })
                
                except Exception as e:
                    continue
    
    except Exception as e:
        print(f"CSV 파일 읽기 오류: {e}")
        return
    
    print(f"\n=== 수리내역에서 사용되는 일련번호 분석 ===")
    print(f"총 사용된 일련번호: {len(repair_serials)}개")
    print(f"장비 DB에 있는 일련번호: {len(repair_serials.intersection(set(equipment_dict.keys())))}개")
    print(f"장비 DB에 없는 일련번호: {len(missing_serials)}개")
    
    if missing_serials:
        print("\n=== 누락된 장비 목록 ===")
        # 품목계열별로 그룹화
        missing_by_series = {}
        for missing in missing_serials:
            series = missing['product_series']
            if series not in missing_by_series:
                missing_by_series[series] = []
            missing_by_series[series].append(missing)
        
        for series, items in missing_by_series.items():
            print(f"\n{series}:")
            for item in items:
                print(f"  - {item['serial']} (라인 {item['row']})")
        
        # 누락된 장비를 위한 기본 데이터 생성
        print("\n=== 누락된 장비 기본 데이터 생성 ===")
        missing_equipment = []
        
        for missing in missing_serials:
            # 품목계열에서 측정항목과 모델명 추출
            product_info = missing['product_series']
            match = re.match(r'\((.*?)\)\s*(.*)', product_info)
            
            if match:
                measurement_item = match.group(1).strip()
                product_series = match.group(2).strip()
            else:
                measurement_item = "기타"
                product_series = product_info
            
            equipment = {
                "serial": missing['serial'],
                "measurement_item": measurement_item,
                "product_series": product_series,
                "category": product_info,
                "currentLocation": "본사 창고",
                "status": "대기 중",
                "lastMovement": "",
                "uptimeEstimatePct": 0,
                "repairCount": 0,
                "totalRepairCost": 0
            }
            
            missing_equipment.append(equipment)
        
        # 기존 장비 데이터에 누락된 장비 추가
        existing_equipment = list(equipment_dict.values())
        all_equipment = existing_equipment + missing_equipment
        
        # 업데이트된 장비 데이터베이스 저장
        try:
            with open('db/equipment_db_complete.json', 'w', encoding='utf-8') as f:
                json.dump(all_equipment, f, ensure_ascii=False, indent=2)
            
            print(f"\n완전한 장비 데이터베이스가 equipment_db_complete.json에 저장되었습니다.")
            print(f"총 {len(all_equipment)}개의 장비 정보 (기존 {len(existing_equipment)}개 + 누락 {len(missing_equipment)}개)")
            
        except Exception as e:
            print(f"파일 저장 오류: {e}")
    
    else:
        print("\n모든 일련번호가 장비 데이터베이스에 존재합니다.")

if __name__ == "__main__":
    find_missing_equipment()
