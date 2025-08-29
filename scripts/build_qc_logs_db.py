#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QC_logs_fixed.csv 파일을 JSON으로 변환하여 db/QC_logs.json 파일로 구축하는 스크립트
"""

import pandas as pd
import json
import os
from datetime import datetime

def build_qc_logs_db():
    # 파일 경로
    input_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "QC_logs_fixed.csv")
    output_file = os.path.join(os.path.dirname(__file__), "..", "db", "QC_logs.json")
    
    try:
        # CSV 파일 읽기
        print("📖 QC_logs_fixed.csv 파일 읽는 중...")
        df = pd.read_csv(input_file, encoding='utf-8')
        
        print(f"✅ 파일 읽기 성공!")
        print(f"데이터 행 수: {len(df)}")
        print(f"컬럼 수: {len(df.columns)}")
        
        # 컬럼명 정리 및 매핑
        column_mapping = {
            '항목': 'measurement_item',
            '장비명': 'equipment_name',
            '박스번호\n(23.05기준)': 'box_number',
            '일련번호': 'serial_number',
            '정도검사일': 'calibration_date',
            '유효기간': 'expiry_date',
            '기준일': 'reference_date',
            '교정주기': 'calibration_cycle',
            '비고': 'notes',
            '접수월': 'reception_month',
            '계산서날짜': 'invoice_date',
            '등가성': 'equivalence',
            '등가성 내역': 'equivalence_details',
            '비고.1': 'additional_notes',
            '구매년도': 'purchase_year'
        }
        
        # 데이터 정리 및 변환
        qc_logs = []
        
        for index, row in df.iterrows():
            # 빈 행 건너뛰기
            if pd.isna(row['항목']) or str(row['항목']).strip() == '':
                continue
                
            # 데이터 정리
            qc_log = {}
            
            for korean_col, english_col in column_mapping.items():
                if korean_col in row:
                    value = row[korean_col]
                    
                    # NaN 값 처리
                    if pd.isna(value):
                        qc_log[english_col] = None
                    else:
                        # 문자열 정리
                        if isinstance(value, str):
                            value = value.strip()
                            if value == '':
                                value = None
                        
                        qc_log[english_col] = value
                else:
                    qc_log[english_col] = None
            
            # 추가 필드
            qc_log['id'] = f"qc_{index + 1:04d}"
            qc_log['created_at'] = datetime.now().isoformat()
            
            # 날짜 형식 정리
            if qc_log['calibration_date']:
                try:
                    # YYYY.MM.DD 형식을 YYYY-MM-DD로 변환
                    if '.' in str(qc_log['calibration_date']):
                        date_parts = str(qc_log['calibration_date']).split('.')
                        if len(date_parts) == 3:
                            qc_log['calibration_date'] = f"{date_parts[0]}-{date_parts[1].zfill(2)}-{date_parts[2].zfill(2)}"
                except:
                    pass
            
            if qc_log['expiry_date']:
                try:
                    # YYYY.MM.DD 형식을 YYYY-MM-DD로 변환
                    if '.' in str(qc_log['expiry_date']):
                        date_parts = str(qc_log['expiry_date']).split('.')
                        if len(date_parts) == 3:
                            qc_log['expiry_date'] = f"{date_parts[0]}-{date_parts[1].zfill(2)}-{date_parts[2].zfill(2)}"
                except:
                    pass
            
            qc_logs.append(qc_log)
        
        print(f"✅ 데이터 변환 완료: {len(qc_logs)}개 레코드")
        
        # JSON 파일로 저장
        print("💾 JSON 파일 저장 중...")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(qc_logs, f, ensure_ascii=False, indent=2)
        
        print(f"✅ QC_logs.json 파일 생성 완료: {output_file}")
        
        # 샘플 데이터 출력
        print("\n📋 샘플 데이터:")
        if qc_logs:
            sample = qc_logs[0]
            for key, value in sample.items():
                print(f"  {key}: {value}")
        
        # 통계 정보
        print(f"\n📊 통계 정보:")
        print(f"  - 총 레코드 수: {len(qc_logs)}")
        
        # 측정 항목별 통계
        measurement_items = {}
        for log in qc_logs:
            item = log.get('measurement_item', '기타')
            measurement_items[item] = measurement_items.get(item, 0) + 1
        
        print(f"  - 측정 항목별 분포:")
        for item, count in sorted(measurement_items.items(), key=lambda x: x[1], reverse=True):
            print(f"    {item}: {count}개")
        
        return True
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    build_qc_logs_db()
