#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
청명장비 이동 로그 CSV를 오늘까지 갱신합니다.

사용법:
  python scripts/update_movements_csv.py "청명장비 엑셀/8.29~9.15movements_logs.csv" "db/movements_db.json" --encoding cp949

동작:
- 기존 CSV를 지정 인코딩(기본 cp949)으로 읽어 마지막 데이터 날짜를 파악
- movements_db.json에서 마지막 날짜 이후 ~ 오늘까지의 이동 이력을 같은 스키마로 생성
- 기존 파일에 이어붙여 같은 인코딩으로 저장

주의:
- 원본 첫 두 줄(요약/헤더)은 그대로 보존합니다
- 열 수(9열)를 맞춰 부족한 값은 빈 칸으로 채웁니다
"""

import csv
import json
import re
import sys
import argparse
from datetime import datetime, date
from pathlib import Path


DATE_RE = re.compile(r"(\d{4})[\-/](\d{1,2})[\-/](\d{1,2})")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("csv_path", help="기존 이동 로그 CSV 경로")
    p.add_argument("json_path", help="db/movements_db.json 경로")
    p.add_argument("--encoding", default="cp949", help="CSV 입출력 인코딩 (기본 cp949)")
    return p.parse_args()


def safe_read_csv_rows(csv_path: Path, encoding: str):
    # cp949 실패 시 utf-8-sig 폴백
    tried = []
    for enc in [encoding, "utf-8-sig", "utf-8"]:
        try:
            with open(csv_path, "r", encoding=enc, newline="") as f:
                reader = csv.reader(f)
                rows = list(reader)
            return rows, enc
        except Exception as e:
            tried.append((enc, str(e)))
    raise RuntimeError(f"CSV 읽기 실패: {csv_path} / 시도: {tried}")


def extract_last_date(rows):
    # 데이터 시작: 통상 3행째부터. 첫 두 줄은 요약/헤더로 간주
    last_dt = None
    for r in rows[2:]:
        if not r:
            continue
        m = DATE_RE.search(r[0]) if len(r) >= 1 else None
        if not m:
            continue
        y, mth, d = map(int, m.groups())
        try:
            dt = date(y, mth, d)
        except ValueError:
            continue
        if last_dt is None or dt > last_dt:
            last_dt = dt
    return last_dt


def load_movements(json_path: Path):
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def ymd_to_slash(d: date) -> str:
    return f"{d.year:04d}/{d.month:02d}/{d.day:02d}"


def main():
    args = parse_args()
    csv_path = Path(args.csv_path)
    json_path = Path(args.json_path)

    if not csv_path.exists():
        print(f"❌ CSV 파일을 찾을 수 없습니다: {csv_path}")
        sys.exit(1)
    if not json_path.exists():
        print(f"❌ JSON 파일을 찾을 수 없습니다: {json_path}")
        sys.exit(1)

    rows, read_enc = safe_read_csv_rows(csv_path, args.encoding)
    print(f"✅ CSV 읽기 인코딩: {read_enc}, 총 행수: {len(rows)}")

    last_dt = extract_last_date(rows)
    if last_dt is None:
        # 데이터가 없으면 1970-01-01부터
        last_dt = date(1970, 1, 1)
    print(f"📅 CSV 마지막 날짜: {last_dt}")

    data = load_movements(json_path)
    today = date.today()

    # JSON 스키마: {date:"YYYY-MM-DD", outLocation, inLocation, equipmentName, serial, quantity, note, status}
    # CSV 타깃 스키마(9열 가정):
    # 0 날짜/번호: "YYYY/MM/DD -1"
    # 1 출고창고명
    # 2 입고창고명
    # 3 품목명
    # 4 일련번호
    # 5 수량
    # 6 비고
    # 7 (예비)
    # 8 담당자
    new_rows = []
    for mv in data:
        try:
            dt = datetime.strptime(mv.get("date", ""), "%Y-%m-%d").date()
        except Exception:
            continue
        if dt <= last_dt or dt > today:
            continue
        date_no = f"{ymd_to_slash(dt)} -1"
        out_loc = mv.get("outLocation", "") or ""
        in_loc = mv.get("inLocation", "") or ""
        name = mv.get("equipmentName", "") or ""
        serial = mv.get("serial", "") or ""
        qty = mv.get("quantity", 1) or 1
        note = mv.get("note", "") or ""
        row = [
            date_no,
            out_loc,
            in_loc,
            name,
            serial,
            qty,
            note,
            "",
            "",
        ]
        # 열 수 보정(9열 유지)
        if len(row) < 9:
            row += [""] * (9 - len(row))
        elif len(row) > 9:
            row = row[:9]
        new_rows.append(row)

    if not new_rows:
        print("ℹ️ 추가할 신규 로그가 없습니다. (마지막 날짜 이후 없음)")
        return

    # 정렬(날짜 오름차순)
    def parse_dt_from_row(r):
        m = DATE_RE.search(r[0])
        if not m:
            return date(1970, 1, 1)
        y, mth, d = map(int, m.groups())
        return date(y, mth, d)

    new_rows.sort(key=parse_dt_from_row)

    # 파일에 이어쓰기: 원본 앞 2줄 + 기존 데이터 + 신규 데이터
    # 주의: 기존 rows는 이미 모두 있음. 단순히 뒤에 붙임
    out_enc = args.encoding
    tmp_path = csv_path.with_suffix(".tmp.csv")
    with open(tmp_path, "w", encoding=out_enc, newline="") as f:
        writer = csv.writer(f)
        for r in rows:
            writer.writerow(r)
        for r in new_rows:
            writer.writerow(r)

    tmp_path.replace(csv_path)
    print(f"✅ 갱신 완료: {csv_path} (추가 {len(new_rows)}행, 인코딩 {out_enc})")


if __name__ == "__main__":
    main()


