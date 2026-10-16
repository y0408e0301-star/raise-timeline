#!/bin/bash
# リポジトリの中の画面（package.json）、API サーバー（mvnw / gradlew）、Terraform（*.tf）、シェルスクリプト（*.sh）の
# コードチェックをまとめて実行し、結果を表で出す。使い方: bash run-checks.sh <リポジトリのパス>
# ファイルは変更しない（書式の自動修正もしない）。各コマンドの出力の末尾はログに残す。
# ツールが入っていないチェックは「未導入」として飛ばす（失敗にはしない）。導入は references/setup.md
repo="${1:-.}"
cd "$repo" || { echo "リポジトリが見つかりません: $repo" >&2; exit 2; }
skill_dir="$(cd "$(dirname "$0")/.." && pwd)"
log_dir="${TMPDIR:-/tmp}/quality-check-$$"
mkdir -p "$log_dir"
results=()
failed=0

# winget で入れた直後のツールは、開き直す前のシェルでは PATH に入っていないので探す
winget_pkgs="${LOCALAPPDATA:-$HOME/AppData/Local}/Microsoft/WinGet/Packages"
for d in "$winget_pkgs"/{Hashicorp.Terraform,TerraformLinters.tflint,AquaSecurity.Trivy,koalaman.shellcheck}_*; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
export PATH

run() { # run <名前> <フォルダ> <コマンド...>
  local name="$1" dir="$2"; shift 2
  local log="$log_dir/$(echo "$name" | tr ' /:' '___').log"
  if (cd "$dir" && "$@") >"$log" 2>&1; then
    results+=("| $name | 成功 | |")
  else
    failed=1
    results+=("| $name | **失敗** | $log |")
    echo "---- $name（失敗）: 出力の末尾 ----"
    grep -E "error|ERROR|Error|warning|Warning|FAIL|Tests run:|violation|HIGH|CRITICAL|SC[0-9]{4}|^---|^\+\+\+" "$log" | grep -v "^\[ERROR\] *$" | tail -25
  fi
}

skip() { # skip <名前> <理由>
  results+=("| $1 | 未導入（スキップ） | $2 |")
}

# 画面：package.json に lint / build があれば実行する（node_modules がなければ npm ci）
for pkg in $(git ls-files '*package.json' 2>/dev/null | grep -v node_modules); do
  dir=$(dirname "$pkg")
  [ -d "$dir/node_modules" ] || run "$dir: npm ci" "$dir" npm ci
  grep -q '"lint"' "$pkg" && run "$dir: npm run lint" "$dir" npm run lint
  # CI=true で Vitest などを監視モードにせず 1 回だけ実行する
  grep -q '"test"' "$pkg" && run "$dir: npm test" "$dir" env CI=true npm test
  grep -q '"build"' "$pkg" && run "$dir: npm run build" "$dir" npm run build
done

# API サーバー：Maven なら verify、Gradle なら check（どちらもテスト込み）
for w in $(git ls-files '*mvnw' 2>/dev/null); do
  run "$(dirname "$w"): mvnw verify" "$(dirname "$w")" sh ./mvnw -B verify
done
for w in $(git ls-files '*gradlew' 2>/dev/null); do
  run "$(dirname "$w"): gradlew check" "$(dirname "$w")" sh ./gradlew check
done

# Terraform：*.tf があるフォルダごとに 書式・構文・lint・セキュリティ
# AWS には接続しない（init は -backend=false、plan は実行しない）
for dir in $(git ls-files '*.tf' 2>/dev/null | xargs -r -n1 dirname | sort -u); do
  if ! command -v terraform >/dev/null; then
    skip "$dir: terraform" "terraform がない"
    continue
  fi
  run "$dir: terraform fmt" "$dir" terraform fmt -check -diff -recursive
  # .terraform がなければプロバイダーだけ入れる（state や backend には触れない）
  [ -d "$dir/.terraform" ] || run "$dir: terraform init" "$dir" terraform init -backend=false -input=false
  run "$dir: terraform validate" "$dir" terraform validate -no-color
  if command -v tflint >/dev/null; then
    config="$PWD/$dir/.tflint.hcl"
    [ -f "$config" ] || config="$skill_dir/references/tflint.hcl"
    run "$dir: tflint" "$dir" sh -c "tflint --init --config='$config' >/dev/null && tflint --config='$config' --format=compact"
  else
    skip "$dir: tflint" "winget install TerraformLinters.tflint"
  fi
  if command -v trivy >/dev/null; then
    # HIGH・CRITICAL があれば失敗にする（MEDIUM 以下も一覧には出す）
    run "$dir: trivy config" "$dir" sh -c "trivy config --quiet --severity LOW,MEDIUM,HIGH,CRITICAL . && trivy config --quiet --exit-code 1 --severity HIGH,CRITICAL . >/dev/null"
  else
    skip "$dir: trivy config" "winget install AquaSecurity.Trivy"
  fi
done

# シェルスクリプト（デプロイ・サーバーの設定など）
sh_files=$(git ls-files '*.sh' 2>/dev/null | grep -v -E '(^|/)mvnw$|node_modules')
if [ -n "$sh_files" ]; then
  if command -v shellcheck >/dev/null; then
    # shellcheck disable=SC2086
    run "shellcheck" . shellcheck --format=gcc $sh_files
  else
    skip "shellcheck" "winget install koalaman.shellcheck"
  fi
fi

echo
echo "| チェック | 結果 | ログ |"
echo "| --- | --- | --- |"
printf '%s\n' "${results[@]}"
[ ${#results[@]} -eq 0 ] && echo "（チェックできるものが見つかりませんでした。references/setup.md で導入を検討する）"
exit $failed
