import json

def clean_repairs_db():
    """헤더를 제거하고 정리된 수리 데이터베이스를 생성합니다."""
    
    # 기존 파일 로드
    try:
        with open('db/repairs_db_final.json', 'r', encoding='utf-8') as f:
            repairs_data = json.load(f)
        print(f"기존 수리 데이터 로드: {len(repairs_data)}건")
    except Exception as e:
        print(f"파일 로드 오류: {e}")
        return
    
    # 헤더 제거 (첫 번째와 두 번째 항목)
    if repairs_data and repairs_data[0]['serial'] == 'Unnamed: 8':
        repairs_data = repairs_data[2:]
        print("헤더 2줄 제거 완료")
    
    # 유효한 수리 기록만 필터링
    valid_repairs = []
    for repair in repairs_data:
        if (repair['serial'] and 
            repair['serial'] != 'Unnamed: 8' and 
            repair['serial'] != '규격' and
            repair['serial'] != '일련번호'):
            valid_repairs.append(repair)
    
    print(f"유효한 수리 기록: {len(valid_repairs)}건")
    
    # JSON 파일로 저장
    output_file = 'db/repairs_db_clean.json'
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(valid_repairs, f, ensure_ascii=False, indent=2)
        print(f"\n정리된 수리 데이터베이스가 {output_file}에 저장되었습니다.")
        
        # 통계 정보 출력
        print("\n=== 정리된 수리 데이터베이스 통계 ===")
        print(f"총 수리 기록: {len(valid_repairs)}건")
        
        # 수리업체별 통계
        companies = {}
        for repair in valid_repairs:
            company = repair['repair_company']
            companies[company] = companies.get(company, 0) + 1
        
        print(f"\n수리업체별 통계:")
        for company, count in sorted(companies.items()):
            print(f"  {company}: {count}건")
        
        # 장비 매칭 성공률
        matched_count = sum(1 for repair in valid_repairs if repair['measurement_item'] != "알 수 없음")
        match_rate = (matched_count / len(valid_repairs)) * 100 if valid_repairs else 0
        print(f"\n장비 매칭 성공률: {match_rate:.1f}% ({matched_count}/{len(valid_repairs)})")
        
        # 일련번호별 수리 횟수 (상위 10개)
        serial_counts = {}
        for repair in valid_repairs:
            serial = repair['serial']
            serial_counts[serial] = serial_counts.get(serial, 0) + 1
        
        print(f"\n일련번호별 수리 횟수 (상위 10개):")
        sorted_serials = sorted(serial_counts.items(), key=lambda x: x[1], reverse=True)
        for serial, count in sorted_serials[:10]:
            print(f"  {serial}: {count}회")
                
    except Exception as e:
        print(f"파일 저장 오류: {e}")

if __name__ == "__main__":
    clean_repairs_db()
