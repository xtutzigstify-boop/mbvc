"""Выгружает листы Excel в JSON-сетку (список строк из строк) для tools/build_seed.js"""
import json, sys, openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
sheets = [[[('' if v is None else str(v)) for v in row] for row in ws.iter_rows(values_only=True)] for ws in wb]
json.dump(sheets, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
