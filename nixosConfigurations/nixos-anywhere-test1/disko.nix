{
  disko.devices.disk.main = {
    type = "disk";

    # DigitalOcean's virtio disks carry no serial, so /dev/disk/by-id is empty
    # on this droplet and by-path is the only stable handle. It also cannot
    # resolve to /dev/vdb, which is the 490K cloud-init config ISO rather than
    # a spare disk. See the constraints table in the design doc.
    device = "/dev/disk/by-path/virtio-pci-0000:00:06.0";

    content = {
      type = "gpt";
      partitions = {
        # GRUB's core image needs somewhere to live on a GPT disk that boots
        # via BIOS. EF02 is the BIOS boot partition type code; it holds no
        # filesystem and is never mounted. The explicit priority only states
        # the ordering disko would pick anyway: it already defaults EF02 to
        # 100 and 100%-sized partitions to 9001, smallest created first.
        boot = {
          size = "1M";
          type = "EF02";
          priority = 1;
        };
        root = {
          size = "100%";
          content = {
            type = "filesystem";
            format = "ext4";
            mountpoint = "/";
          };
        };
      };
    };
  };
}
