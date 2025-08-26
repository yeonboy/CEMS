import csv
import json
import re
import os

def parse_serials_csv(csv_file_path):
    """serials.csv 파일을 파싱하여 장비 정보를 추출합니다."""
    equipment_list = []
    
    print(f"CSV 파일 경로: {csv_file_path}")
    print(f"파일 존재 여부: {os.path.exists(csv_file_path)}")
    
    if not os.path.exists(csv_file_path):
        print(f"오류: 파일을 찾을 수 없습니다: {csv_file_path}")
        return []
    
    try:
        with open(csv_file_path, 'r', encoding='utf-8') as file:
            # CSV 파일의 인코딩 문제로 인해 직접 읽기
            content = file.read()
            lines = content.split('\n')
            
            print(f"총 라인 수: {len(lines)}")
            
            for i, line in enumerate(lines):
                if not line.strip():
                    continue
                    
                print(f"처리 중인 라인 {i+1}: {line}")
                
                # 쉼표로 분리 (쉼표가 포함된 필드는 따옴표로 감싸져 있음)
                parts = []
                current_part = ""
                in_quotes = False
                
                for char in line:
                    if char == '"':
                        in_quotes = not in_quotes
                    elif char == ',' and not in_quotes:
                        parts.append(current_part.strip())
                        current_part = ""
                    else:
                        current_part += char
                
                parts.append(current_part.strip())
                
                print(f"분리된 부분: {parts}")
                
                if len(parts) >= 3:
                    try:
                        # 첫 번째 열은 번호 (무시)
                        category_info = parts[1].strip()
                        serial_number = parts[2].strip()
                        
                        # 측정항목과 품목계열 추출
                        # (측정항목) 품목계열 형태에서 추출
                        match = re.match(r'\((.*?)\)\s*(.*)', category_info)
                        
                        if match:
                            measurement_item = match.group(1).strip()  # 측정항목
                            product_series = match.group(2).strip()    # 품목계열
                            
                            equipment = {
                                "serial": serial_number,
                                "measurement_item": measurement_item,  # 측정항목
                                "product_series": product_series,      # 품목계열
                                "category": category_info,            # 전체 카테고리 정보
                                "currentLocation": "본사 창고",        # 기본 위치
                                "status": "대기 중",                  # 기본 상태
                                "lastMovement": "",                   # 마지막 이동 정보
                                "uptimeEstimatePct": 0,              # 가동률 추정
                                "repairCount": 0,                    # 수리 횟수
                                "totalRepairCost": 0                 # 총 수리 비용
                            }
                            
                            equipment_list.append(equipment)
                            print(f"추출됨: {serial_number} - {measurement_item} / {product_series}")
                        
                    except Exception as e:
                        print(f"라인 파싱 오류: {line} - {e}")
                        continue
                else:
                    print(f"라인 {i+1}의 필드 수가 부족합니다: {len(parts)}")
    
    except Exception as e:
        print(f"파일 읽기 오류: {e}")
        return []
    
    return equipment_list

def save_equipment_db(equipment_list, output_file):
    """장비 목록을 JSON 파일로 저장합니다."""
    try:
        with open(output_file, 'w', encoding='utf-8') as file:
            json.dump(equipment_list, file, ensure_ascii=False, indent=2)
        
        print(f"\n총 {len(equipment_list)}개의 장비 정보가 {output_file}에 저장되었습니다.")
    except Exception as e:
        print(f"파일 저장 오류: {e}")

def main():
    # 파일 경로 설정
    csv_file = r"C:\Users\User\Desktop\cmes 데모\청명장비 엑셀\serials.csv"
    output_file = r"C:\Users\User\Desktop\cmes 데모\db\equipment_db_new.json"
    
    print("=== serials.csv 파싱 시작 ===")
    
    # CSV 파일 파싱
    print("serials.csv 파일을 파싱 중...")
    equipment_list = parse_serials_csv(csv_file)
    
    if equipment_list:
        # 결과 저장
        save_equipment_db(equipment_list, output_file)
        
        # 샘플 데이터 출력
        print("\n샘플 데이터:")
        for i, equipment in enumerate(equipment_list[:5]):
            print(f"{i+1}. {equipment['serial']} - {equipment['measurement_item']} / {equipment['product_series']}")
    else:
        print("장비 정보를 추출할 수 없습니다.")
    
    print("=== 파싱 완료 ===")

if __name__ == "__main__":
    main()
