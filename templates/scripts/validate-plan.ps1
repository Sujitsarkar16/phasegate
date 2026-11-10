# Copy alongside validate-plan.mjs in a plan's scripts directory.
# Uses the single JavaScript validator; requires a local agentic-phase-gate installation.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot 'validate-plan.mjs'
& node $validator
exit $LASTEXITCODE
