import json
import csv
import re
from datetime import datetime

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

def parse_repair_date(date_str):
    """수리일자를 파싱합니다."""
    try:
        # 23/01/10-1 형태에서 날짜 부분만 추출
        date_part = date_str.split('-')[0]
        year = '20' + date_part[:2]
        month = date_part[3:5]
        day = date_part[6:8]
        return f"{year}-{month}-{day}"
    except:
        return date_str

def create_repairs_db():
    """수리내역logs.csv를 파싱하여 수리 데이터베이스를 생성합니다."""
    
    # 장비 데이터베이스 로드
    equipment_dict = load_equipment_db()
    if not equipment_dict:
        return
    
    repairs_data = []
    
    try:
        with open('청명장비 엑셀/수리내역logs.csv', 'r', encoding='utf-8') as file:
            # CSV 리더 생성
            csv_reader = csv.reader(file)
            
            for row_num, row in enumerate(csv_reader):
                # 헤더 행과 빈 행 건너뛰기
                if row_num < 2 or not row or len(row) < 10:
                    continue
                
                try:
                    # CSV 컬럼 매핑 (0부터 시작)
                    # 0: 일자-No., 1: 제목(사용안함), 2: 수리업체, 3: 수리유형명(사용안함), 
                    # 4: 담당자명, 5: 품목계열명, 6: 단가, 7: 수리구분, 8: 일련번호, 9: 순번
                    
                    repair_date = row[0].strip() if len(row) > 0 else ""
                    repair_company = row[2].strip() if len(row) > 2 else ""
                    manager = row[4].strip() if len(row) > 4 else ""
                    product_series = row[5].strip() if len(row) > 5 else ""
                    cost = row[6].strip() if len(row) > 6 else ""
                    repair_type = row[7].strip() if len(row) > 7 else ""
                    serial_number = row[8].strip() if len(row) > 8 else ""
                    sequence = row[9].strip() if len(row) > 9 else ""
                    
                    # 일련번호가 없거나 "21"인 경우 건너뛰기 (일반적인 경우)
                    if not serial_number or serial_number == "21":
                        continue
                    
                    # 장비 데이터베이스에서 해당 일련번호 찾기
                    equipment = equipment_dict.get(serial_number)
                    if not equipment:
                        print(f"일련번호 {serial_number}에 해당하는 장비를 찾을 수 없습니다.")
                        continue
                    
                    # 수리 데이터 생성
                    repair_record = {
                        "id": f"{repair_date}-{sequence}",
                        "serial": serial_number,
                        "repair_date": parse_repair_date(repair_date),
                        "repair_company": repair_company,
                        "manager": manager,
                        "product_series": product_series,
                        "cost": cost,
                        "repair_type": repair_type,
                        "sequence": sequence,
                        # 장비 정보 추가
                        "measurement_item": equipment.get("measurement_item", ""),
                        "equipment_category": equipment.get("category", ""),
                        "equipment_status": equipment.get("status", "")
                    }
                    
                    repairs_data.append(repair_record)
                    
                except Exception as e:
                    print(f"라인 {row_num + 1} 파싱 오류: {e}")
                    continue
    
    except Exception as e:
        print(f"CSV 파일 읽기 오류: {e}")
        return
    
    # JSON 파일로 저장
    try:
        with open('db/repairs_db.json', 'w', encoding='utf-8') as f:
            json.dump(repairs_data, f, ensure_ascii=False, indent=2)
        
        print(f"\n총 {len(repairs_data)}개의 수리 기록이 repairs_db.json에 저장되었습니다.")
        
        # 통계 정보 출력
        print("\n=== 수리 데이터 통계 ===")
        
        # 수리업체별 통계
        company_counts = {}
        for repair in repairs_data:
            company = repair['repair_company']
            company_counts[company] = company_counts.get(company, 0) + 1
        
        print("수리업체별 통계:")
        for company, count in sorted(company_counts.items()):
            print(f"  {company}: {count}건")
        
        # 측정항목별 통계
        measurement_counts = {}
        for repair in repairs_data:
            item = repair['measurement_item']
            measurement_counts[item] = measurement_counts.get(item, 0) + 1
        
        print("\n측정항목별 수리 통계:")
        for item, count in sorted(measurement_counts.items()):
            print(f"  {item}: {count}건")
        
        # 수리구분별 통계
        repair_type_counts = {}
        for repair in repairs_data:
            repair_type = repair['repair_type']
            repair_type_counts[repair_type] = repair_type_counts.get(repair_type, 0) + 1
        
        print("\n수리구분별 통계:")
        for repair_type, count in sorted(repair_type_counts.items()):
            print(f"  {repair_type}: {count}건")
        
        # 샘플 데이터 출력
        print("\n=== 샘플 수리 데이터 ===")
        for i, repair in enumerate(repairs_data[:5]):
            print(f"{i+1}. {repair['serial']} - {repair['repair_date']} - {repair['repair_type']} ({repair['repair_company']})")
    
    except Exception as e:
        print(f"파일 저장 오류: {e}")

if __name__ == "__main__":
    create_repairs_db()
