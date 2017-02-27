package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
)

const configPath = "/usr/local/etc/haproxy/haproxy.cfg"

func main() {
	addrsVar := os.Getenv("ADDRS")
	if addrsVar == "" {
		log.Fatal("You must specify `ADDRS`")
	}

	addrs := strings.Split(addrsVar, ",")
	if err := configureHAProxy(addrs); err != nil {
		log.Fatalf("Error configuring HAProxy: %s", err.Error())
	}

	if err := runHAProxy(); err != nil {
		log.Fatalf("Error running HAProxy: %s", err.Error())
	}
}

func runHAProxy() error {
	cmd := exec.Command("haproxy-systemd-wrapper", "-p", "/run/haproxy.pid",
		"-f", configPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func buildHAProxyConfig(addrs []string) string {
	var lines []string
	for i, addr := range addrs {
		lines = append(lines,
			fmt.Sprintf("    server %d %s check resolvers dns", i, addr))

	}

	return strings.Join(lines, "\n")
}

func configureHAProxy(addrs []string) error {
	f, err := os.OpenFile(configPath, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer f.Close()

	text := buildHAProxyConfig(addrs)
	log.Printf("Appending the following to HAProxy config:\n%s", text)

	_, err = f.WriteString(fmt.Sprintf("%s\n", text))
	return err
}
