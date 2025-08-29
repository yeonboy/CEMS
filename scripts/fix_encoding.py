#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한글이 깨진 CSV 파일을 수정하는 스크립트
"""

import pandas as pd
import os
import sys

def fix_csv_encoding(input_file, output_file=None, encoding='cp949'):
    """
    CSV 파일의 인코딩을 수정합니다.
    
    Args:
        input_file (str): 입력 파일 경로
        output_file (str): 출력 파일 경로 (None이면 입력 파일 덮어쓰기)
        encoding (str): 원본 파일의 인코딩 (보통 'cp949' 또는 'euc-kr')
    """
    try:
        # 원본 인코딩으로 파일 읽기
        df = pd.read_csv(input_file, encoding=encoding)
        
        # 헤더 확인 및 수정
        print(f"원본 헤더: {list(df.columns)}")
        
        # 올바른 헤더로 변경 (파일 내용에 따라 조정)
        if 'serials.csv' in input_file:
            correct_headers = ['번호', '품목계열', '시리얼번호']
        elif 'logs.csv' in input_file:
            # logs.csv의 경우 실제 헤더를 확인해야 함
            correct_headers = list(df.columns)
        else:
            # 다른 파일들의 경우 여기에 추가
            correct_headers = list(df.columns)
        
        df.columns = correct_headers
        
        # 출력 파일 경로 설정
        if output_file is None:
            output_file = input_file.replace('.csv', '_fixed.csv')
        
        # UTF-8로 저장
        df.to_csv(output_file, encoding='utf-8', index=False)
        
        print(f"✅ 파일 수정 완료: {output_file}")
        print(f"수정된 헤더: {list(df.columns)}")
        print(f"데이터 행 수: {len(df)}")
        
        # 처음 몇 행 출력하여 확인
        print("\n처음 5행:")
        print(df.head())
        
        return True
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        return False

def main():
    # 현재 디렉토리의 CSV 파일들 찾기
    csv_files = []
    
    # 청명장비 엑셀 폴더에서 CSV 파일 찾기
    excel_dir = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀")
    if os.path.exists(excel_dir):
        for file in os.listdir(excel_dir):
            if file.endswith('.csv'):
                csv_files.append(os.path.join(excel_dir, file))
    
    if not csv_files:
        print("CSV 파일을 찾을 수 없습니다.")
        print(f"검색 경로: {excel_dir}")
        return
    
    print("발견된 CSV 파일들:")
    for i, file in enumerate(csv_files):
        print(f"{i+1}. {os.path.basename(file)}")
    
    # 사용자 선택
    try:
        choice = int(input("\n수정할 파일 번호를 선택하세요 (0: 모든 파일): ")) - 1
        
        if choice == -1:  # 모든 파일
            for file in csv_files:
                print(f"\n--- {os.path.basename(file)} 처리 중 ---")
                fix_csv_encoding(file)
        elif 0 <= choice < len(csv_files):
            file = csv_files[choice]
            print(f"\n--- {os.path.basename(file)} 처리 중 ---")
            fix_csv_encoding(file)
        else:
            print("잘못된 선택입니다.")
            
    except ValueError:
        print("숫자를 입력해주세요.")
    except KeyboardInterrupt:
        print("\n작업이 취소되었습니다.")

if __name__ == "__main__":
    main()
