{ modulesPath, ... }:
{
  imports = [
    (modulesPath + "/profiles/qemu-guest.nix")
    ./disko.nix
  ];

  nixpkgs.hostPlatform = "x86_64-linux";
  system.stateVersion = "26.11";

  networking.hostName = "nixos-anywhere-test1";

  # DigitalOcean boots droplets with SeaBIOS and gives no way to switch a
  # standard droplet to EFI: /sys/firmware/efi does not exist on the target.
  # GRUB installs to the disk itself, into the EF02 partition disko lays down,
  # and EFI support stays off.
  #
  # boot.loader.grub.devices is deliberately not set here. disko already sets
  # it to the disk carrying the EF02 partition, so setting it again produces
  # a duplicate and trips grub's "duplicated devices in mirroredBoots"
  # assertion. Leaving it to disko also keeps the device declared in exactly
  # one place, ./disko.nix, where it cannot drift from the disk being
  # partitioned.
  boot.loader.grub = {
    enable = true;
    efiSupport = false;
  };

  # net.ifnames=0 keeps the first virtio NIC named eth0, which is what the
  # droplet's own cloud image does. The serial console is the only way to read
  # boot output through the DigitalOcean web console if the host does not come
  # back on the network.
  boot.kernelParams = [
    "net.ifnames=0"
    "console=tty1"
    "console=ttyS0,115200"
  ];

  # This droplet answers no DHCP offers. Verified with `dhcpcd -T eth0` on the
  # target: it solicited for about twenty seconds, received nothing, and fell
  # back to an IPv4LL address. NixOS defaults networking.useDHCP to true, so
  # leaving it alone would install cleanly and then come up with no network.
  # Every address below is copied from the droplet's own cloud-init netplan.
  networking.useDHCP = false;
  networking.interfaces.eth0.ipv4.addresses = [
    {
      address = "178.128.76.203";
      prefixLength = 20;
    }
    # DigitalOcean's anchor address, which the droplet's netplan also carries.
    {
      address = "10.46.0.5";
      prefixLength = 16;
    }
  ];
  networking.defaultGateway = "178.128.64.1";

  # Not DigitalOcean's regional resolver at 10.120.15.254: it is only
  # reachable over the eth1 VPC interface, which this host does not configure.
  networking.nameservers = [
    "1.1.1.1"
    "9.9.9.9"
  ];

  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "prohibit-password";
      PasswordAuthentication = false;
    };
  };

  # The only way into this host. There is no root password, by design, so this
  # key is byte-identical to the one already in the droplet's authorized_keys;
  # only the trailing comment differs.
  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEbH7DL3UpeYHm+J3YHJTIsnk/vdo5JgEzwD/Bf1tupp yubikey"
  ];
}
