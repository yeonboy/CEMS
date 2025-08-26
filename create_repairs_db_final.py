import json
import csv
import re
from datetime import datetime

def load_equipment_db():
    """equipment_db_clean.json에서 장비 정보를 로드합니다."""
    try:
        with open('db/equipment_db_clean.json', 'r', encoding='utf-8') as f:
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
    
    repairs_list = []
    csv_file_path = '청명장비 엑셀/수리내역logs.csv'
    
    print(f"수리내역 CSV 파일 파싱 시작: {csv_file_path}")
    
    # 여러 인코딩 시도
    encodings = ['utf-8', 'utf-8-sig', 'cp949', 'euc-kr']
    
    for encoding in encodings:
        try:
            print(f"인코딩 {encoding}으로 시도 중...")
            with open(csv_file_path, 'r', encoding=encoding) as file:
                csv_reader = csv.reader(file)
                
                for row_num, row in enumerate(csv_reader, 1):
                    if len(row) < 9:
                        print(f"라인 {row_num}: 필드 수 부족 - {row}")
                        continue
                    
                    try:
                        # CSV 컬럼 매핑
                        repair_date = row[0].strip()  # 1열: 수리일자
                        repair_company = row[2].strip()  # 3열: 수리업체
                        manager = row[4].strip()  # 5열: 담당자명
                        product_series = row[5].strip()  # 6열: 품목계열명
                        cost = row[6].strip()  # 7열: 수리 비용
                        repair_type = row[7].strip()  # 8열: 수리구분
                        serial_number = row[8].strip()  # 9열: 일련번호
                        
                        # 일련번호가 장비 데이터베이스에 있는지 확인
                        if serial_number in equipment_dict:
                            equipment = equipment_dict[serial_number]
                            measurement_item = equipment['measurement_item']
                            equipment_category = equipment['category']
                        else:
                            print(f"라인 {row_num}: 일련번호 {serial_number}를 장비 DB에서 찾을 수 없음")
                            measurement_item = "알 수 없음"
                            equipment_category = product_series
                        
                        # 수리 기록 생성
                        repair_record = {
                            "id": repair_date,
                            "serial": serial_number,
                            "repair_date": parse_repair_date(repair_date),
                            "repair_company": repair_company,
                            "manager": manager,
                            "product_series": product_series,
                            "cost": cost,
                            "repair_type": repair_type,
                            "sequence": row[9] if len(row) > 9 else "",
                            "measurement_item": measurement_item,
                            "equipment_category": equipment_category,
                            "equipment_status": equipment_dict.get(serial_number, {}).get('status', '알 수 없음')
                        }
                        
                        repairs_list.append(repair_record)
                        
                        if row_num <= 10 or row_num % 1000 == 0:
                            print(f"라인 {row_num}: {serial_number} - {repair_company} - {cost}원")
                            
                    except Exception as e:
                        print(f"라인 {row_num} 파싱 오류: {e} - {row}")
                        continue
                
                print(f"인코딩 {encoding}으로 성공적으로 파싱되었습니다!")
                break
                
        except Exception as e:
            print(f"인코딩 {encoding} 실패: {e}")
            repairs_list = []  # 리스트 초기화
            continue
    
    if not repairs_list:
        print("모든 인코딩 시도가 실패했습니다.")
        return
    
    print(f"\n총 {len(repairs_list)}개의 수리 기록을 추출했습니다.")
    
    # JSON 파일로 저장
    output_file = 'db/repairs_db_final.json'
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(repairs_list, f, ensure_ascii=False, indent=2)
        print(f"\n수리 데이터베이스가 {output_file}에 저장되었습니다.")
        
        # 통계 정보 출력
        print("\n=== 수리 데이터베이스 통계 ===")
        print(f"총 수리 기록: {len(repairs_list)}건")
        
        # 수리업체별 통계
        companies = {}
        for repair in repairs_list:
            company = repair['repair_company']
            companies[company] = companies.get(company, 0) + 1
        
        print(f"\n수리업체별 통계:")
        for company, count in sorted(companies.items()):
            print(f"  {company}: {count}건")
        
        # 장비 매칭 성공률
        matched_count = sum(1 for repair in repairs_list if repair['measurement_item'] != "알 수 없음")
        match_rate = (matched_count / len(repairs_list)) * 100 if repairs_list else 0
        print(f"\n장비 매칭 성공률: {match_rate:.1f}% ({matched_count}/{len(repairs_list)})")
        
    except Exception as e:
        print(f"파일 저장 오류: {e}")

def main():
    """메인 함수"""
    print("수리 데이터베이스 생성 시작...")
    create_repairs_db()

if __name__ == "__main__":
    main()
