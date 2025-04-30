#!/bin/bash

# Clear the output file
echo "" >link-outputs.md

# Base URL
BASE_URL="https://r.jina.ai/"

# Read each line in links.txt
while IFS= read -r link; do
	# Prepend the base URL
	full_url="${BASE_URL}${link}"

	# Use wget with extended timeout
	# -T specifies timeout in seconds (e.g., 60 seconds)
	# -O to specify output file to save the content
	output_file="output-$(basename "$link").md"

	# Download the link
	wget --timeout=60 -O "$output_file" "$full_url"

	# Append the content of the downloaded file to link-outputs.md
	if [ -f "$output_file" ]; then
		echo "## Output for: $full_url" >>link-outputs.md
		cat "$output_file" >>link-outputs.md
		echo -e "\n\n" >>link-outputs.md
	fi

done <./links.txt
