#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QC_logs.csv 파일의 한글 인코딩을 수정하는 스크립트
"""

import pandas as pd
import os

def fix_qc_logs_encoding():
    # 파일 경로
    input_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "QC_logs.csv")
    output_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "QC_logs_fixed.csv")
    
    try:
        # cp949 인코딩으로 읽기 (한국어 Windows 기본 인코딩)
        print("📖 QC_logs.csv 파일 읽는 중...")
        df = pd.read_csv(input_file, encoding='cp949')
        
        print(f"✅ 파일 읽기 성공!")
        print(f"원본 헤더: {list(df.columns)}")
        print(f"데이터 행 수: {len(df)}")
        
        # 처음 몇 행 출력하여 확인
        print("\n처음 5행:")
        print(df.head())
        
        # UTF-8로 저장
        df.to_csv(output_file, encoding='utf-8', index=False)
        
        print(f"\n✅ 파일 수정 완료: {output_file}")
        print(f"수정된 헤더: {list(df.columns)}")
        
        # 컬럼명 정리 (필요시)
        print("\n📋 컬럼 정보:")
        for i, col in enumerate(df.columns):
            print(f"  {i}: {col}")
        
        return True
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    fix_qc_logs_encoding()
