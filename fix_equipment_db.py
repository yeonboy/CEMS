import json
import csv
import re
import os

def parse_serials_csv():
    """serials.csv 파일을 정확하게 파싱하여 장비 정보를 추출합니다."""
    csv_file_path = '청명장비 엑셀/serials.csv'
    
    print(f"CSV 파일 경로: {csv_file_path}")
    print(f"파일 존재 여부: {os.path.exists(csv_file_path)}")
    
    if not os.path.exists(csv_file_path):
        print(f"오류: 파일을 찾을 수 없습니다: {csv_file_path}")
        return []
    
    equipment_list = []
    
    # 여러 인코딩 시도
    encodings = ['cp949', 'euc-kr', 'utf-8-sig', 'utf-8']
    
    for encoding in encodings:
        try:
            print(f"인코딩 {encoding}으로 시도 중...")
            with open(csv_file_path, 'r', encoding=encoding) as file:
                csv_reader = csv.reader(file)
                
                for row_num, row in enumerate(csv_reader, 1):
                    if len(row) < 3:
                        print(f"라인 {row_num}: 필드 수 부족 - {row}")
                        continue
                    
                    try:
                        # 첫 번째 필드는 인덱스 (사용하지 않음)
                        category_info = row[1].strip()
                        serial_number = row[2].strip()
                        
                        # 측정항목과 품목계열 추출
                        match = re.match(r'\((.*?)\)\s*(.*)', category_info)
                        if match:
                            measurement_item = match.group(1).strip()
                            product_series = match.group(2).strip()
                        else:
                            measurement_item = "알 수 없음"
                            product_series = category_info
                        
                        equipment = {
                            "serial": serial_number,
                            "measurement_item": measurement_item,
                            "product_series": product_series,
                            "category": category_info,
                            "currentLocation": "본사 창고",
                            "status": "대기 중",
                            "lastMovement": "",
                            "uptimeEstimatePct": 0,
                            "repairCount": 0,
                            "totalRepairCost": 0
                        }
                        
                        equipment_list.append(equipment)
                        
                        if row_num <= 10 or row_num % 50 == 0:
                            print(f"라인 {row_num}: {serial_number} - {measurement_item} - {product_series}")
                            
                    except Exception as e:
                        print(f"라인 {row_num} 파싱 오류: {e} - {row}")
                        continue
                
                print(f"인코딩 {encoding}으로 성공적으로 파싱되었습니다!")
                break
                
        except Exception as e:
            print(f"인코딩 {encoding} 실패: {e}")
            equipment_list = []  # 리스트 초기화
            continue
    
    if not equipment_list:
        print("모든 인코딩 시도가 실패했습니다.")
        return []
    
    print(f"\n총 {len(equipment_list)}개의 장비 정보를 추출했습니다.")
    return equipment_list

def main():
    """메인 함수"""
    print("serials.csv 파일 파싱 시작...")
    
    # CSV 파일 파싱
    equipment_data = parse_serials_csv()
    
    if not equipment_data:
        print("장비 데이터를 추출할 수 없습니다.")
        return
    
    # JSON 파일로 저장
    output_file = 'db/equipment_db_fixed.json'
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(equipment_data, f, ensure_ascii=False, indent=2)
        print(f"\n장비 데이터베이스가 {output_file}에 저장되었습니다.")
        
        # 일련번호 목록 출력 (검증용)
        serials = [eq['serial'] for eq in equipment_data]
        print(f"\n일련번호 목록 (처음 20개): {serials[:20]}")
        print(f"일련번호 목록 (마지막 20개): {serials[-20:]}")
        
        # 특정 일련번호 검색
        target_serials = ['1316', '851', '1793']
        for target in target_serials:
            if target in serials:
                print(f"✓ {target} 발견됨")
            else:
                print(f"✗ {target} 누락됨")
                
    except Exception as e:
        print(f"파일 저장 오류: {e}")

if __name__ == "__main__":
    main()
