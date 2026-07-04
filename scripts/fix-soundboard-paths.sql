-- Aplique no DB Browser for SQLite (app Stream Media Board FECHADO).
-- Abra: %APPDATA%\LocalSoundboardServer\database\storage.db
-- Aba Execute SQL -> cole -> Run -> Write Changes
--
-- Troque CAMINHO_ANTIGO pelo prefixo que aparece em clips.audio_path
-- (tudo antes de \media\audio\).
-- Exemplo antigo: C:\Users\Marcos\AppData\Roaming\LocalSoundboardServer
-- Exemplo novo:   C:\Users\Marcos Pessoal\AppData\Roaming\LocalSoundboardServer

UPDATE clips SET
  audio_path = REPLACE(audio_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO'),
  video_path = REPLACE(video_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO'),
  thumbnail_original_path = REPLACE(thumbnail_original_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO'),
  thumbnail_cropped_path = REPLACE(thumbnail_cropped_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO');

UPDATE categories SET
  thumbnail_original_path = REPLACE(thumbnail_original_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO'),
  thumbnail_cropped_path = REPLACE(thumbnail_cropped_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO');

UPDATE media_search_cache SET
  media_path = REPLACE(media_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO'),
  preview_path = REPLACE(preview_path, 'CAMINHO_ANTIGO', 'CAMINHO_NOVO');
