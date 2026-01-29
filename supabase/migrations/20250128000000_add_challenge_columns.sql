-- チャレンジ機能・加点ボーナス用カラム追加
-- テーブル名が evaluation_history の場合は evaluations を evaluation_history に置き換えて実行してください。

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS challenge_easy TEXT,
  ADD COLUMN IF NOT EXISTS challenge_medium TEXT,
  ADD COLUMN IF NOT EXISTS challenge_hard TEXT,
  ADD COLUMN IF NOT EXISTS challenge_easy_done BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS challenge_medium_done BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS challenge_hard_done BOOLEAN DEFAULT FALSE;
