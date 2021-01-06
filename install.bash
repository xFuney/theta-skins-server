#!/bin/bash

# Script to initialise/de-initialise hosts file for
# ActionMC legacy skin servers.

# Virtue, 2020

# Script-wide configuration

# Actual code beyond this point.


# Initialise functions.
print_info () {
	printf "\nThis script adds a line to your hosts file which\n"
	printf "allows any legacy Minecraft client to\n"
	printf "communicate with our custom skin servers.\n\n"
	printf "This change intercepts connections to the website\n"
	printf "s3.amazonaws.com and redirects them to our own\n"
	printf "server.\n\n"
	printf "If you use your machine for anything other than\n"
	printf "playing Minecraft, it is best to only turn on\n"
	printf "this modification when playing legacy Minecraft\n"
	printf "or Action MC. A lot of the internet relies on\n"
	printf "Amazon's S3 services, and we cannot provide all of\n"
	printf "their services.\n\n"
	printf "You will need superuser privileges in order to run\n"
	printf "this script, so ensure that you are running this\n"
	printf "script as a superuser.\n"
}

print_end () {
	printf "\nThe script is finished its task. Please check that\n"
	printf "the server IP resolves properly by starting a web\n"
	printf "browser and navigating to http://s3.amazonaws.com/statistics.\n\n"
	printf "If this works, you are good to go! Launch Minecraft\n"
	printf "and see everyone's skins!\n"
}

init_skins () {
	printf "\n[+] Adding line to /etc/hosts for s3.amazonaws.com...\n"
	printf "\n%%IP%%	s3.amazonaws.com" >> /etc/hosts
	printf "[+] Added line to /etc/hosts successfully.\n\n"
}

remove_skins () {
	printf "\n"
	echo [-] Removing line from /etc/hosts for s3.amazonaws.com...
	grep -v "s3.amazonaws.com" /etc/hosts > tmphosts
	rm /etc/hosts
	mv tmphosts /etc/hosts
	echo [-] Removing temporary files...
	printf "\n"
	echo [-] Removed line from /etc/hosts successfully.
	printf "\n"
}

obtain_sudo () {
	if [ "${UID}" -eq 0 ]
	then
		echo "Running as root."
	else
		echo "Not running as root. Run this script as root."
		exit 1
	fi
}

# Program title.
printf "ActionMC Skin Server Manager\n"
echo ----------------------------

# Print information.
print_info

echo ----------------------------
printf "\n"
#printf "Please grant this script access to modify the hosts file.\n"

# Obtain sudo before proceeding.
obtain_sudo

# If we are this far already, we have root/sudo.
printf "Privilege obtained.\n\n----------------------------\n"

case `grep -R "s3.amazonaws.com" /etc/hosts >/dev/null; echo $?` in
	0)
		# Found S3 in the hosts.
		printf "\n"
		echo [!] Found reference to Amazon S3 in hosts file.
		remove_skins
		;;
	1)
		# Not found
		printf "\n"
		echo [!] Found no reference to Amazon S3 in hosts file.
		init_skins
		;;
	*)
		# Error.
		printf "\n"
		echo Exception thrown trying to find S3 in the hosts file.
		;;
esac

echo -----------------------------
print_end

# EOF
